"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode } from "@/lib/ids";
import { writeAudit, auditDiff } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { saveUpload } from "@/lib/uploads";
import type { CertificateStatus, CertificateType } from "@/lib/enums";

const parseDate = (v: FormDataEntryValue | null) => {
  if (!v || typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const parseDec = (v: FormDataEntryValue | null) => {
  if (!v || typeof v !== "string" || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);

const laboratorySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  country: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function createLaboratory(fd: FormData) {
  const session = await requireCapability("certificate:write");
  const parsed = laboratorySchema.parse({
    code: fd.get("code"),
    name: fd.get("name"),
    country: fd.get("country"),
    website: fd.get("website"),
    notes: fd.get("notes"),
  });
  const lab = await prisma.laboratory.create({ data: parsed });
  await writeAudit({
    entity: "Laboratory", entityId: lab.id, entityCode: lab.code, action: "CREATE",
    userId: session.user.id, userName: session.user.name ?? null,
    newValue: `Lab ${lab.name} added.`,
  });
  revalidatePath("/certificates");
}

export async function createCertificate(fd: FormData) {
  const session = await requireCapability("certificate:write");
  const gemstoneId = str(fd.get("gemstoneId"));
  const laboratoryId = str(fd.get("laboratoryId"));
  if (!gemstoneId || !laboratoryId) throw new Error("Gemstone and laboratory are required.");

  const gem = await prisma.gemstone.findUniqueOrThrow({ where: { id: gemstoneId } });

  const documentFile = fd.get("documentFile") as File | null;
  const imageFile = fd.get("imageFile") as File | null;
  const [document, image] = await Promise.all([
    saveUpload(documentFile, "certificates"),
    saveUpload(imageFile, "certificates"),
  ]);

  const year = new Date().getUTCFullYear();
  const cert = await prisma.$transaction(async (tx) => {
    const code = await nextCode(codePrefix.certificate, year, tx, { pad: 5 });
    const created = await tx.certificate.create({
      data: {
        code,
        gemstoneId,
        laboratoryId,
        certificateNumber: str(fd.get("certificateNumber")),
        type: (str(fd.get("type")) as CertificateType) ?? "IDENTIFICATION",
        status: (str(fd.get("status")) as CertificateStatus) ?? "SUBMITTED",
        submissionDate: parseDate(fd.get("submissionDate")),
        returnDate: parseDate(fd.get("returnDate")),
        issueDate: parseDate(fd.get("issueDate")),
        originDetermination: str(fd.get("originDetermination")),
        treatmentDetermination: str(fd.get("treatmentDetermination")),
        weightCt: parseDec(fd.get("weightCt")),
        dimensions: str(fd.get("dimensions")),
        colorGrade: str(fd.get("colorGrade")),
        comments: str(fd.get("comments")),
        laboratoryFees: parseDec(fd.get("laboratoryFees")),
        currency: str(fd.get("currency")) ?? "LKR",
        documentUrl: document?.url ?? str(fd.get("documentUrl")),
        imageUrl: image?.url ?? str(fd.get("imageUrl")),
      },
    });
    await writeAudit({
      entity: "Certificate", entityId: created.id, entityCode: created.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Certificate ${created.code} attached to ${gem.code}.`,
      metadata: { gemstoneId },
    }, tx);
    return created;
  });
  revalidatePath(`/gemstones/${gemstoneId}`);
  revalidatePath("/certificates");
  return cert.id;
}

export async function updateCertificateStatus(fd: FormData) {
  const session = await requireCapability("certificate:write");
  const id = str(fd.get("id"));
  const status = str(fd.get("status")) as CertificateStatus | null;
  if (!id || !status) throw new Error("id and status required");
  const before = await prisma.certificate.findUniqueOrThrow({ where: { id } });
  const after = await prisma.certificate.update({
    where: { id },
    data: {
      status,
      issueDate: status === "ISSUED" && !before.issueDate ? new Date() : before.issueDate,
      returnDate: status === "ISSUED" && !before.returnDate ? new Date() : before.returnDate,
    },
  });
  await auditDiff(
    { entity: "Certificate", entityId: id, entityCode: before.code, userId: session.user.id, userName: session.user.name ?? null, action: "STATUS_CHANGE" },
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
    ["status", "issueDate", "returnDate"] as never[],
  );
  if (status === "ISSUED" && before.status !== "ISSUED") {
    const gem = await prisma.gemstone.findUniqueOrThrow({ where: { id: before.gemstoneId } });
    await notify({
      type: "CERTIFICATE_ISSUED",
      title: `Certificate issued for ${gem.code}`,
      body: `${before.code} · type ${before.type}`,
      entity: "Gemstone", entityId: gem.id, entityCode: gem.code,
      url: `/gemstones/${gem.id}`,
      excludeUserIds: [session.user.id],
    });
  }
  revalidatePath(`/gemstones/${before.gemstoneId}`);
  revalidatePath("/certificates");
}
