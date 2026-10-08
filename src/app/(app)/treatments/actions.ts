"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { codePrefix, nextCode } from "@/lib/ids";
import { TREATMENT_STATUSES, isTreatmentStatus } from "@/lib/treatment-types";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);
const money = (v: FormDataEntryValue | null) => {
  const s = text(v);
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const day = (v: FormDataEntryValue | null) => {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const schema = z.object({
  kind: z.enum(["ROUGH", "GEMSTONE"]),
  stoneId: z.string().min(1, "Choose the stone that is being treated."),
  type: z.string().min(1, "Enter the type of treatment.").max(120),
  status: z.enum(TREATMENT_STATUSES),
  providerKind: z.enum(["COMPANY", "PERSON", "IN_HOUSE"]).nullable(),
  providerName: z.string().max(200).nullable(),
  providerContact: z.string().max(300).nullable(),
  startDate: z.date().nullable(),
  endDate: z.date().nullable(),
  cost: z.number().min(0, "The cost cannot be negative."),
  currency: z.string().min(1).max(6),
  weightBeforeCt: z.number().min(0).nullable(),
  weightAfterCt: z.number().min(0).nullable(),
  notes: z.string().max(4000).nullable(),
});

function parse(fd: FormData) {
  const parsed = schema.safeParse({
    kind: text(fd.get("kind")),
    stoneId: text(fd.get("stoneId")) ?? "",
    type: text(fd.get("type")) ?? "",
    status: text(fd.get("status")) ?? "PLANNED",
    providerKind: text(fd.get("providerKind")),
    providerName: text(fd.get("providerName")),
    providerContact: text(fd.get("providerContact")),
    startDate: day(fd.get("startDate")),
    endDate: day(fd.get("endDate")),
    cost: money(fd.get("cost")) ?? 0,
    currency: text(fd.get("currency")) ?? "LKR",
    weightBeforeCt: money(fd.get("weightBeforeCt")),
    weightAfterCt: money(fd.get("weightAfterCt")),
    notes: text(fd.get("notes")),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the details and try again.");
  const d = parsed.data;
  if (d.startDate && d.endDate && d.endDate < d.startDate) throw new Error("The end date cannot be before the start date.");
  return d;
}

/** A missing table (database not updated yet) gets a plain explanation instead of a stack trace. */
function friendly(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/does not exist|P2021|relation .*Treatment/i.test(msg)) {
    return new Error("The treatments table has not been created in the database yet. Run `npm run db:push` once, then try again.");
  }
  return e instanceof Error ? e : new Error(msg);
}

async function stoneRef(kind: "ROUGH" | "GEMSTONE", stoneId: string) {
  const stone = kind === "ROUGH"
    ? await prisma.roughStone.findUnique({ where: { id: stoneId }, select: { id: true, code: true } })
    : await prisma.gemstone.findUnique({ where: { id: stoneId }, select: { id: true, code: true } });
  if (!stone) throw new Error("That stone no longer exists.");
  return stone;
}

function revalidateFor(kind: "ROUGH" | "GEMSTONE", stoneId: string) {
  revalidatePath("/treatments");
  revalidatePath(kind === "ROUGH" ? `/rough/${stoneId}` : `/gemstones/${stoneId}`);
}

/** When a treatment is completed, optionally record it in the stone's own "treatment" field. */
async function applyToStone(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], kind: "ROUGH" | "GEMSTONE", stoneId: string, type: string) {
  if (kind === "ROUGH") await tx.roughStone.update({ where: { id: stoneId }, data: { treatment: type } });
  else await tx.gemstone.update({ where: { id: stoneId }, data: { treatment: type } });
}

export async function createTreatment(fd: FormData) {
  const session = await requireCapability("treatment:write");
  const d = parse(fd);
  const stone = await stoneRef(d.kind, d.stoneId);
  const apply = text(fd.get("applyToStone")) === "on" && d.status === "COMPLETED";
  try {
    await prisma.$transaction(async (tx) => {
      const year = (d.startDate ?? new Date()).getUTCFullYear();
      const code = await nextCode(codePrefix.treatment, year, tx, { pad: 5 });
      const t = await tx.treatment.create({
        data: {
          code,
          roughStoneId: d.kind === "ROUGH" ? d.stoneId : null,
          gemstoneId: d.kind === "GEMSTONE" ? d.stoneId : null,
          type: d.type, status: d.status,
          providerKind: d.providerKind, providerName: d.providerName, providerContact: d.providerContact,
          startDate: d.startDate, endDate: d.endDate,
          cost: d.cost, currency: d.currency,
          weightBeforeCt: d.weightBeforeCt, weightAfterCt: d.weightAfterCt,
          notes: d.notes, createdBy: session.user.name ?? null,
        },
      });
      if (apply) await applyToStone(tx, d.kind, d.stoneId, d.type);
      await writeAudit({
        entity: "Treatment", entityId: t.id, entityCode: t.code, action: "CREATE",
        userId: session.user.id, userName: session.user.name ?? null,
        newValue: `${d.type} on ${stone.code}${d.providerName ? ` by ${d.providerName}` : ""} (${d.status}).`,
      }, tx);
    });
  } catch (e) {
    throw friendly(e);
  }
  revalidateFor(d.kind, d.stoneId);
}

export async function updateTreatment(fd: FormData) {
  const session = await requireCapability("treatment:write");
  const id = text(fd.get("id"));
  if (!id) throw new Error("Treatment id missing.");
  const d = parse(fd);
  const apply = text(fd.get("applyToStone")) === "on" && d.status === "COMPLETED";
  try {
    const before = await prisma.treatment.findUniqueOrThrow({ where: { id } });
    await prisma.$transaction(async (tx) => {
      // The stone a treatment belongs to is fixed once it is created.
      await tx.treatment.update({
        where: { id },
        data: {
          type: d.type, status: d.status,
          providerKind: d.providerKind, providerName: d.providerName, providerContact: d.providerContact,
          startDate: d.startDate, endDate: d.endDate,
          cost: d.cost, currency: d.currency,
          weightBeforeCt: d.weightBeforeCt, weightAfterCt: d.weightAfterCt,
          notes: d.notes,
        },
      });
      if (apply) await applyToStone(tx, before.roughStoneId ? "ROUGH" : "GEMSTONE", (before.roughStoneId ?? before.gemstoneId)!, d.type);
      await writeAudit({
        entity: "Treatment", entityId: id, entityCode: before.code, action: "UPDATE",
        userId: session.user.id, userName: session.user.name ?? null,
        newValue: `${before.code} updated (${d.type}, ${d.status}).`,
      }, tx);
    });
    const kind = before.roughStoneId ? "ROUGH" : "GEMSTONE";
    revalidateFor(kind, (before.roughStoneId ?? before.gemstoneId)!);
  } catch (e) {
    throw friendly(e);
  }
}

export async function setTreatmentStatus(id: string, status: string) {
  const session = await requireCapability("treatment:write");
  if (!isTreatmentStatus(status)) throw new Error("Unknown status.");
  try {
    const before = await prisma.treatment.findUniqueOrThrow({ where: { id } });
    if (before.status === status) return;
    await prisma.$transaction(async (tx) => {
      await tx.treatment.update({
        where: { id },
        data: {
          status,
          // Starting or finishing fills in the date that is still empty.
          ...(status === "IN_PROGRESS" && !before.startDate ? { startDate: new Date() } : {}),
          ...(status === "COMPLETED" && !before.endDate ? { endDate: new Date() } : {}),
        },
      });
      await writeAudit({
        entity: "Treatment", entityId: id, entityCode: before.code, action: "STATUS",
        userId: session.user.id, userName: session.user.name ?? null,
        oldValue: before.status, newValue: status,
      }, tx);
    });
    revalidateFor(before.roughStoneId ? "ROUGH" : "GEMSTONE", (before.roughStoneId ?? before.gemstoneId)!);
  } catch (e) {
    throw friendly(e);
  }
}
