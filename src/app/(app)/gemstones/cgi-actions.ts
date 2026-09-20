"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { saveUpload } from "@/lib/uploads";
import type { AssetKind, MediaStage } from "@/lib/enums";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);

export async function createCgiProject(fd: FormData) {
  const session = await requireCapability("cgi:write");
  const gemstoneId = str(fd.get("gemstoneId"));
  if (!gemstoneId) throw new Error("gemstoneId required");
  const gem = await prisma.gemstone.findUniqueOrThrow({ where: { id: gemstoneId } });
  const year = new Date().getUTCFullYear();
  await prisma.$transaction(async (tx) => {
    const code = await nextCode(codePrefix.cgi, year, tx, { pad: 5 });
    const project = await tx.cGIProject.create({
      data: {
        code,
        gemstoneId,
        artist: str(fd.get("artist")),
        software: str(fd.get("software")),
        softwareVersion: str(fd.get("softwareVersion")),
        notes: str(fd.get("notes")),
        status: "REQUESTED",
      },
    });
    await writeAudit({
      entity: "CGIProject", entityId: project.id, entityCode: project.code,
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `CGI project ${project.code} opened for ${gem.code}.`,
      metadata: { gemstoneId },
    }, tx);
  });
  revalidatePath(`/gemstones/${gemstoneId}`);
  revalidatePath("/cgi");
}

export async function addCgiVersion(fd: FormData) {
  const session = await requireCapability("cgi:write");
  const projectId = str(fd.get("projectId"));
  if (!projectId) throw new Error("projectId required");
  const project = await prisma.cGIProject.findUniqueOrThrow({
    where: { id: projectId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  const [renderFile, animationFile, thumbnailFile] = [
    fd.get("renderFile") as File | null,
    fd.get("animationFile") as File | null,
    fd.get("thumbnailFile") as File | null,
  ];
  const [render, animation, thumbnail] = await Promise.all([
    saveUpload(renderFile, "cgi"),
    saveUpload(animationFile, "cgi"),
    saveUpload(thumbnailFile, "cgi"),
  ]);

  const nextVersion = (project.versions[0]?.version ?? 0) + 1;
  const versionCode = `${project.code}-V${nextVersion}`;
  await prisma.$transaction(async (tx) => {
    const version = await tx.cGIVersion.create({
      data: {
        projectId,
        version: nextVersion,
        code: versionCode,
        renderUrl: render?.url ?? str(fd.get("renderUrl")),
        animationUrl: animation?.url ?? str(fd.get("animationUrl")),
        thumbnailUrl: thumbnail?.url ?? render?.url ?? str(fd.get("thumbnailUrl")),
        modelUrl: str(fd.get("modelUrl")),
        notes: str(fd.get("notes")),
      },
    });
    if (project.status === "REQUESTED") {
      await tx.cGIProject.update({ where: { id: projectId }, data: { status: "IN_PROGRESS" } });
    }
    await writeAudit({
      entity: "CGIProject", entityId: project.id, entityCode: project.code,
      action: "VERSION_ADDED", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Added ${version.code}.`,
    }, tx);
  });
  revalidatePath(`/gemstones/${project.gemstoneId}`);
  revalidatePath("/cgi");
}

export async function markCgiMaster(fd: FormData) {
  const session = await requireCapability("cgi:write");
  const versionId = str(fd.get("versionId"));
  if (!versionId) throw new Error("versionId required");
  const version = await prisma.cGIVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { project: true },
  });
  await prisma.$transaction(async (tx) => {
    // Clear master flag on every other version in this project.
    await tx.cGIVersion.updateMany({
      where: { projectId: version.projectId, NOT: { id: version.id } },
      data: { isMaster: false },
    });
    await tx.cGIVersion.update({
      where: { id: version.id },
      data: { isMaster: true, approvedAt: new Date(), approvedBy: session.user.name ?? null },
    });
    await tx.cGIProject.update({
      where: { id: version.projectId },
      data: { status: "APPROVED" },
    });
    await writeAudit({
      entity: "CGIProject", entityId: version.projectId, entityCode: version.project.code,
      action: "MASTER_SET", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${version.code} marked as master.`,
    }, tx);
    const gem = await tx.gemstone.findUniqueOrThrow({ where: { id: version.project.gemstoneId } });
    await notify({
      type: "CGI_MASTER_SET",
      title: `Master CGI approved for ${gem.code}`,
      body: `${version.code} · project ${version.project.code}`,
      entity: "Gemstone", entityId: gem.id, entityCode: gem.code,
      url: `/gemstones/${gem.id}`,
      excludeUserIds: [session.user.id],
    }, tx);
  });
  revalidatePath(`/gemstones/${version.project.gemstoneId}`);
  revalidatePath("/cgi");
}

export async function uploadPhoto(fd: FormData) {
  const session = await requireCapability("media:write");
  const gemstoneId = str(fd.get("gemstoneId"));
  const roughStoneId = str(fd.get("roughStoneId"));
  const cuttingJobId = str(fd.get("cuttingJobId"));
  if (!gemstoneId && !roughStoneId && !cuttingJobId) {
    throw new Error("Must attach media to a rough stone, cutting job, or gemstone.");
  }
  const kind = (str(fd.get("kind")) as AssetKind) ?? "FINISHED_PHOTO";
  const stage = str(fd.get("stage")) as MediaStage | null;
  const caption = str(fd.get("caption"));
  const isPrimary = str(fd.get("isPrimary")) === "on";
  const capturedAtRaw = str(fd.get("capturedAt"));
  const capturedAt = capturedAtRaw ? new Date(capturedAtRaw) : null;
  const file = fd.get("file") as File | null;
  const subdir = gemstoneId ? "photos-gem" : cuttingJobId ? "photos-cutting" : "photos-rough";
  const saved = await saveUpload(file, subdir);
  const externalUrl = str(fd.get("url"));
  const url = saved?.url ?? externalUrl;
  if (!url) throw new Error("Provide a file or URL.");

  await prisma.$transaction(async (tx) => {
    if (isPrimary && (gemstoneId || roughStoneId)) {
      await tx.digitalAsset.updateMany({
        where: gemstoneId ? { gemstoneId, kind } : { roughStoneId: roughStoneId!, kind },
        data: { isPrimary: false },
      });
    }
    const asset = await tx.digitalAsset.create({
      data: {
        gemstoneId, roughStoneId, cuttingJobId,
        kind, stage, url, caption, isPrimary,
        capturedAt: capturedAt && !isNaN(capturedAt.getTime()) ? capturedAt : null,
        contentType: saved?.contentType ?? null,
        originalName: saved?.originalName ?? null,
        createdBy: session.user.name ?? null,
      },
    });
    const target = gemstoneId ? "gemstone" : cuttingJobId ? "cutting job" : "rough";
    await writeAudit({
      entity: "DigitalAsset", entityId: asset.id, entityCode: asset.id.slice(0, 8),
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Uploaded ${kind}${stage ? ` (${stage})` : ""} for ${target}.`,
      metadata: { gemstoneId, roughStoneId, cuttingJobId, kind, stage },
    }, tx);
  });
  if (gemstoneId) revalidatePath(`/gemstones/${gemstoneId}`);
  if (roughStoneId) revalidatePath(`/rough/${roughStoneId}`);
  if (cuttingJobId) revalidatePath(`/cutting/${cuttingJobId}`);
}

export async function deleteDigitalAsset(fd: FormData) {
  const session = await requireCapability("media:write");
  const id = str(fd.get("id"));
  if (!id) throw new Error("id required");
  const asset = await prisma.digitalAsset.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction(async (tx) => {
    await tx.digitalAsset.delete({ where: { id } });
    await writeAudit({
      entity: "DigitalAsset", entityId: id, entityCode: id.slice(0, 8),
      action: "DELETE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Removed asset (${asset.kind}${asset.stage ? ` · ${asset.stage}` : ""}).`,
    }, tx);
  });
  if (asset.gemstoneId)   revalidatePath(`/gemstones/${asset.gemstoneId}`);
  if (asset.roughStoneId) revalidatePath(`/rough/${asset.roughStoneId}`);
  if (asset.cuttingJobId) revalidatePath(`/cutting/${asset.cuttingJobId}`);
}
