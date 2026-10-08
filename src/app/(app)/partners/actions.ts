"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { codePrefix, nextGlobalCode } from "@/lib/ids";
import { PARTNER_KINDS } from "@/lib/enums";
import { tryPartnerCapability } from "@/lib/partner-auth";
import { OPEN_DEAL_STATUSES, derivedGemIdsByRough } from "@/lib/partner-gather";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

const partnerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long (120 characters at most)"),
  kind: z.enum(PARTNER_KINDS, { errorMap: () => ({ message: "Choose a partner type" }) }),
  company: z.string().max(120, "Company is too long").nullable(),
  contactName: z.string().max(120, "Contact name is too long").nullable(),
  phone: z.string().max(40, "Phone is too long").nullable(),
  email: z.string().email("Enter a valid email address").max(200, "Email is too long").nullable(),
  country: z.string().max(80, "Country is too long").nullable(),
  notes: z.string().max(2000, "Internal notes are too long (2000 characters at most)").nullable(),
});

type PartnerFields = z.infer<typeof partnerSchema>;

function readPartnerForm(fd: FormData) {
  return {
    name: str(fd.get("name")) ?? "",
    kind: str(fd.get("kind")) ?? "",
    company: str(fd.get("company")),
    contactName: str(fd.get("contactName")),
    phone: str(fd.get("phone")),
    email: str(fd.get("email")),
    country: str(fd.get("country")),
    notes: str(fd.get("notes")),
  };
}

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the details and try again.";

export type PartnerSaveResult = { ok: true; id: string; code: string } | { ok: false; error: string };
export type PartnerOutcome = { ok: true } | { ok: false; error: string };

export async function createPartner(fd: FormData): Promise<PartnerSaveResult> {
  const gate = await tryPartnerCapability("partner:write");
  if (!gate.ok) return gate;
  const { session } = gate;
  const parsed = partnerSchema.safeParse(readPartnerForm(fd));
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const d = parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const code = await nextGlobalCode(codePrefix.partner, tx, { pad: 4 });
      const p = await tx.partner.create({
        data: {
          code,
          name: d.name,
          kind: d.kind,
          company: d.company,
          contactName: d.contactName,
          phone: d.phone,
          email: d.email,
          country: d.country,
          notes: d.notes,
          createdById: session.user.id,
        },
      });
      await writeAudit({
        entity: "Partner", entityId: p.id, entityCode: p.code,
        action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
        newValue: `Partner ${p.code} created`,
        metadata: { partnerId: p.id, kind: p.kind },
      }, tx);
      return p;
    });
    revalidatePath("/partners");
    return { ok: true, id: created.id, code: created.code };
  } catch (e) {
    console.error("createPartner failed", e);
    return { ok: false, error: "The partner could not be saved. Try again." };
  }
}

const FIELD_KEYS: (keyof PartnerFields)[] = ["name", "kind", "company", "contactName", "phone", "email", "country", "notes"];

export async function updatePartner(fd: FormData): Promise<PartnerSaveResult> {
  const gate = await tryPartnerCapability("partner:write");
  if (!gate.ok) return gate;
  const { session } = gate;
  const id = str(fd.get("id"));
  if (!id) return { ok: false, error: "Partner not found." };
  const parsed = partnerSchema.safeParse(readPartnerForm(fd));
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const d = parsed.data;

  try {
    const existing = await prisma.partner.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "Partner not found." };
    const changed = FIELD_KEYS.filter((k) => (existing[k] ?? null) !== d[k]);
    if (changed.length === 0) return { ok: true, id: existing.id, code: existing.code };

    await prisma.$transaction(async (tx) => {
      await tx.partner.update({
        where: { id },
        data: {
          name: d.name,
          kind: d.kind,
          company: d.company,
          contactName: d.contactName,
          phone: d.phone,
          email: d.email,
          country: d.country,
          notes: d.notes,
        },
      });
      await writeAudit({
        entity: "Partner", entityId: existing.id, entityCode: existing.code,
        action: "UPDATE", userId: session.user.id, userName: session.user.name ?? null,
        newValue: `Partner ${existing.code} updated`,
        metadata: { partnerId: existing.id, changedFields: changed },
      }, tx);
    });
    revalidatePath("/partners");
    revalidatePath(`/partners/${id}`);
    return { ok: true, id: existing.id, code: existing.code };
  } catch (e) {
    console.error("updatePartner failed", e);
    return { ok: false, error: "The partner could not be saved. Try again." };
  }
}

/** Deactivating switches the partner's statement links off, so it is refused while a deal is still open. */
export async function setPartnerActive(id: string, active: boolean): Promise<PartnerOutcome> {
  const gate = await tryPartnerCapability("partner:write");
  if (!gate.ok) return gate;
  const { session } = gate;
  const parsed = z.object({ id: z.string().min(1).max(64), active: z.boolean() }).safeParse({ id, active });
  if (!parsed.success) return { ok: false, error: "Partner not found." };

  try {
    const partner = await prisma.partner.findUnique({ where: { id: parsed.data.id }, select: { id: true, code: true, active: true } });
    if (!partner) return { ok: false, error: "Partner not found." };
    if (partner.active === parsed.data.active) return { ok: true };
    if (!parsed.data.active) {
      const open = await prisma.partnerDeal.count({ where: { partnerId: partner.id, status: { in: [...OPEN_DEAL_STATUSES] } } });
      if (open > 0) {
        return { ok: false, error: `This partner still has ${open} open deal${open === 1 ? "" : "s"}. Close or cancel ${open === 1 ? "it" : "them"} first.` };
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.partner.update({ where: { id: partner.id }, data: { active: parsed.data.active } });
      await writeAudit({
        entity: "Partner", entityId: partner.id, entityCode: partner.code,
        action: "STATUS_CHANGE", userId: session.user.id, userName: session.user.name ?? null,
        newValue: `Partner ${partner.code} ${parsed.data.active ? "reactivated" : "deactivated"}`,
        metadata: { partnerId: partner.id, active: parsed.data.active },
      }, tx);
    });
    revalidatePath("/partners");
    revalidatePath(`/partners/${partner.id}`);
    return { ok: true };
  } catch (e) {
    console.error("setPartnerActive failed", e);
    return { ok: false, error: "The change could not be saved. Try again." };
  }
}

/**
 * Create-just-enough for EntityPicker. Same shape as quickCreateSupplier: returns the row and throws on failure,
 * because the picker shows the thrown message.
 */
export async function quickCreatePartner(name: string): Promise<{ id: string; name: string; code: string }> {
  const gate = await tryPartnerCapability("partner:write");
  if (!gate.ok) throw new Error(gate.error);
  const { session } = gate;
  const clean = z.string().trim().min(1, "Partner name required").max(120, "Name is too long (120 characters at most)").safeParse(name);
  if (!clean.success) throw new Error(firstIssue(clean.error));

  const created = await prisma.$transaction(async (tx) => {
    const code = await nextGlobalCode(codePrefix.partner, tx, { pad: 4 });
    const p = await tx.partner.create({ data: { code, name: clean.data, createdById: session.user.id } });
    await writeAudit({
      entity: "Partner", entityId: p.id, entityCode: p.code,
      action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Partner ${p.code} created`,
      metadata: { partnerId: p.id, kind: p.kind, via: "quick-add" },
    }, tx);
    return p;
  });
  revalidatePath("/partners");
  return { id: created.id, name: created.name, code: created.code };
}

/**
 * Whether a stone sits in a DRAFT or ACTIVE partner deal directly, through its parent rough (a gem) or through its
 * cut gems (a rough). Answers a yes/no only (no deal, partner or amount), for the add-stone-bill warning.
 */
export async function stoneInOpenPartnerDeal(
  kind: "rough" | "gemstone",
  stoneId: string,
): Promise<{ ok: true; inDeal: boolean } | { ok: false }> {
  const gate = await tryPartnerCapability("expense:write");
  if (!gate.ok) return { ok: false };
  const parsed = z.object({ kind: z.enum(["rough", "gemstone"]), stoneId: z.string().min(1).max(64) }).safeParse({ kind, stoneId });
  if (!parsed.success) return { ok: false };

  try {
    let roughIds: string[] = [];
    let gemIds: string[] = [];
    if (parsed.data.kind === "gemstone") {
      gemIds = [parsed.data.stoneId];
      const parents = await prisma.transformationOutput.findMany({
        where: { gemstoneId: parsed.data.stoneId },
        select: { transformation: { select: { inputs: { select: { roughStoneId: true } } } } },
      });
      roughIds = parents.flatMap((p) => p.transformation.inputs.map((i) => i.roughStoneId));
    } else {
      roughIds = [parsed.data.stoneId];
      gemIds = (await derivedGemIdsByRough(prisma, roughIds)).get(parsed.data.stoneId) ?? [];
    }
    const hit = await prisma.partnerDealStone.findFirst({
      where: {
        removedAt: null,
        deal: { status: { in: [...OPEN_DEAL_STATUSES] } },
        OR: [{ roughStoneId: { in: roughIds } }, { gemstoneId: { in: gemIds } }],
      },
      select: { id: true },
    });
    return { ok: true, inDeal: hit !== null };
  } catch (e) {
    console.error("stoneInOpenPartnerDeal failed", e);
    return { ok: false };
  }
}
