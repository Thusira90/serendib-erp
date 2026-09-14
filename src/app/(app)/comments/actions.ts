"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);

const schema = z.object({
  entity: z.enum(["Gemstone","RoughStone","Customer","CuttingJob","SalesOrder","Enquiry","Quotation","Shipment"]),
  entityId: z.string().min(1),
  entityCode: z.string().nullable(),
  text: z.string().min(1).max(4000),
  revalidate: z.string().nullable(),
});

export async function addComment(fd: FormData) {
  const session = await requireAuth();
  const parsed = schema.parse({
    entity: str(fd.get("entity")) ?? "Gemstone",
    entityId: str(fd.get("entityId")),
    entityCode: str(fd.get("entityCode")),
    text: str(fd.get("text")) ?? "",
    revalidate: str(fd.get("revalidate")),
  });
  await prisma.comment.create({
    data: {
      entity: parsed.entity,
      entityId: parsed.entityId,
      entityCode: parsed.entityCode,
      text: parsed.text,
      authorId: session.user.id,
      authorName: session.user.name ?? null,
    },
  });
  if (parsed.revalidate) revalidatePath(parsed.revalidate);
}

export async function deleteComment(fd: FormData) {
  const session = await requireAuth();
  const id = str(fd.get("id"));
  const revalidate = str(fd.get("revalidate"));
  if (!id) return;
  const existing = await prisma.comment.findUnique({ where: { id } });
  if (!existing) return;
  // Only the author or an ADMINISTRATOR may delete.
  if (existing.authorId !== session.user.id && session.user.role !== "ADMINISTRATOR") {
    throw new Error("You can only delete your own comments.");
  }
  await prisma.comment.delete({ where: { id } });
  if (revalidate) revalidatePath(revalidate);
}
