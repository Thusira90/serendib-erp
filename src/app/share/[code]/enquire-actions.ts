"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { codePrefix, nextCode } from "@/lib/ids";
import { notify } from "@/lib/notifications";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

const enquirySchema = z.object({
  shareCode: z.string().min(1),
  gemstoneId: z.string().min(1),
  senderName: z.string().min(1, "Name is required"),
  senderEmail: z.string().email().or(z.literal("").transform(() => "")).optional(),
  senderPhone: z.string().nullable(),
  message: z.string().min(1, "Please add a short message"),
});

/**
 * Public enquiry submission from the /share/<code> page. No auth — the share
 * code itself is the capability. Creates or reuses a Customer for the sender,
 * then creates an Enquiry attached to the stone and notifies internal users.
 */
export async function submitShareEnquiry(fd: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const parseAttempt = enquirySchema.safeParse({
    shareCode: str(fd.get("shareCode")),
    gemstoneId: str(fd.get("gemstoneId")),
    senderName: str(fd.get("senderName")) ?? "",
    senderEmail: str(fd.get("senderEmail")) ?? "",
    senderPhone: str(fd.get("senderPhone")),
    message: str(fd.get("message")) ?? "",
  });
  if (!parseAttempt.success) {
    return { ok: false, error: parseAttempt.error.issues.map((i) => i.message).join(", ") };
  }
  const parsed = parseAttempt.data;

  const collection = await prisma.collection.findUnique({
    where: { shareCode: parsed.shareCode },
    include: { customer: true },
  });
  if (!collection || collection.isArchived) {
    return { ok: false, error: "This share link is no longer active." };
  }
  if (collection.expiresAt && collection.expiresAt < new Date()) {
    return { ok: false, error: "This share link has expired." };
  }

  const gem = await prisma.gemstone.findUnique({ where: { id: parsed.gemstoneId } });
  if (!gem) return { ok: false, error: "Stone not found in this collection." };

  const year = new Date().getUTCFullYear();

  try {
    await prisma.$transaction(async (tx) => {
      // Prefer the collection's linked customer if there is one; otherwise
      // try to find an existing customer by email, else create a fresh one
      // seeded from the enquiry form.
      let customerId = collection.customerId;
      if (!customerId) {
        if (parsed.senderEmail) {
          const existing = await tx.customer.findFirst({ where: { email: parsed.senderEmail } });
          if (existing) customerId = existing.id;
        }
        if (!customerId) {
          const code = await nextCode(codePrefix.customer, year, tx, { pad: 4 });
          const created = await tx.customer.create({
            data: {
              code,
              displayName: parsed.senderName,
              email: parsed.senderEmail || null,
              phone: parsed.senderPhone,
              type: "PRIVATE_BUYER",
              kind: "INDIVIDUAL",
              notes: `Auto-created from share ${parsed.shareCode}.`,
            },
          });
          customerId = created.id;
        }
      }

      const enqCode = await nextCode(codePrefix.enquiry, year, tx, { pad: 4 });
      const enquiry = await tx.enquiry.create({
        data: {
          code: enqCode,
          customerId,
          gemstoneId: gem.id,
          requirement: `Enquiry from share link ${parsed.shareCode} (${collection.name}). Message: ${parsed.message}`,
          status: "NEW",
          notes: [
            `Sender name: ${parsed.senderName}`,
            parsed.senderEmail ? `Email: ${parsed.senderEmail}` : null,
            parsed.senderPhone ? `Phone: ${parsed.senderPhone}` : null,
          ].filter(Boolean).join("\n"),
        },
      });

      await notify({
        type: "ENQUIRY_NEW",
        title: `New enquiry from ${parsed.senderName}`,
        body: `${enquiry.code} · ${gem.code} · from share ${collection.code}`,
        entity: "Enquiry", entityId: enquiry.id, entityCode: enquiry.code,
        url: `/enquiries?highlight=${enquiry.id}`,
      }, tx);
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  return { ok: true };
}
