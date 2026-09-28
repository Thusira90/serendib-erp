"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ROLES } from "@/lib/enums";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  role: z.enum(ROLES),
  password: z.string().min(8).max(200),
});

export async function createUser(fd: FormData) {
  const session = await requireCapability("user:manage");
  const parsed = createSchema.parse({
    name: str(fd.get("name")) ?? "",
    email: (str(fd.get("email")) ?? "").toLowerCase(),
    role: str(fd.get("role")) ?? "SALES",
    password: str(fd.get("password")) ?? "",
  });
  const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
  if (existing) throw new Error(`A user with email ${parsed.email} already exists.`);
  const passwordHash = await bcrypt.hash(parsed.password, 10);
  const created = await prisma.user.create({
    data: { name: parsed.name, email: parsed.email, role: parsed.role, passwordHash },
  });
  await writeAudit({
    entity: "User", entityId: created.id, entityCode: created.email,
    action: "CREATE", userId: session.user.id, userName: session.user.name ?? null,
    newValue: `${created.name} (${created.role})`,
  });
  revalidatePath("/users");
}

const updateRoleSchema = z.object({
  id: z.string().min(1),
  role: z.enum(ROLES),
});

export async function updateUserRole(fd: FormData) {
  const session = await requireCapability("user:manage");
  const parsed = updateRoleSchema.parse({
    id: str(fd.get("id")),
    role: str(fd.get("role")),
  });
  if (parsed.id === session.user.id) {
    throw new Error("You can't change your own role.");
  }
  const before = await prisma.user.findUniqueOrThrow({ where: { id: parsed.id } });
  await prisma.user.update({ where: { id: parsed.id }, data: { role: parsed.role } });
  await writeAudit({
    entity: "User", entityId: before.id, entityCode: before.email,
    action: "ROLE_CHANGE", field: "role",
    oldValue: before.role, newValue: parsed.role,
    userId: session.user.id, userName: session.user.name ?? null,
  });
  revalidatePath("/users");
}

export async function toggleUserActive(fd: FormData) {
  const session = await requireCapability("user:manage");
  const id = str(fd.get("id"));
  if (!id) throw new Error("id required");
  if (id === session.user.id) throw new Error("You can't deactivate your own account.");
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  await prisma.user.update({ where: { id }, data: { active: !before.active } });
  await writeAudit({
    entity: "User", entityId: before.id, entityCode: before.email,
    action: before.active ? "DEACTIVATED" : "REACTIVATED",
    userId: session.user.id, userName: session.user.name ?? null,
  });
  revalidatePath("/users");
}

const resetPasswordSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(8).max(200),
});

export async function resetPassword(fd: FormData) {
  const session = await requireCapability("user:manage");
  const parsed = resetPasswordSchema.parse({
    id: str(fd.get("id")),
    password: str(fd.get("password")) ?? "",
  });
  const before = await prisma.user.findUniqueOrThrow({ where: { id: parsed.id } });
  const passwordHash = await bcrypt.hash(parsed.password, 10);
  await prisma.user.update({ where: { id: parsed.id }, data: { passwordHash } });
  await writeAudit({
    entity: "User", entityId: before.id, entityCode: before.email,
    action: "PASSWORD_RESET",
    userId: session.user.id, userName: session.user.name ?? null,
    newValue: `Password reset for ${before.name}.`,
  });
  revalidatePath("/users");
}

/**
 * Save per-user capability overrides. `grants` extends the role's default
 * set, `denies` fences access off — a deny always beats a grant.
 * SUPER_ADMIN's `user:manage` cannot be denied (owner safety guard).
 */
const permissionsSchema = z.object({
  id: z.string().min(1),
  grants: z.array(z.string()).default([]),
  denies: z.array(z.string()).default([]),
});

export async function updateUserPermissions(fd: FormData) {
  const session = await requireCapability("user:manage");
  const raw = {
    id: str(fd.get("id")),
    // Both come in as a single string of comma-separated capabilities from
    // the client (checkbox grid serialised).
    grants: (str(fd.get("grants")) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    denies: (str(fd.get("denies")) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
  const parsed = permissionsSchema.parse(raw);

  const before = await prisma.user.findUniqueOrThrow({ where: { id: parsed.id } });

  // Never allow user:manage to be denied — the owner tier must stay able
  // to manage users, or the whole system could be locked out.
  const denies = parsed.denies.filter((c) => c !== "user:manage");

  await prisma.user.update({
    where: { id: parsed.id },
    data: {
      capabilityGrants: parsed.grants.length ? JSON.stringify(parsed.grants) : null,
      capabilityDenies: denies.length ? JSON.stringify(denies) : null,
    },
  });
  await writeAudit({
    entity: "User", entityId: before.id, entityCode: before.email,
    action: "PERMISSIONS_UPDATED",
    userId: session.user.id, userName: session.user.name ?? null,
    newValue: `+${parsed.grants.length} grants · −${denies.length} denies`,
    metadata: { grants: parsed.grants, denies },
  });
  revalidatePath("/users");
}
