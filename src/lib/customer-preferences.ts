import { z } from "zod";

export const customerPreferencesSchema = z.object({
  gemTypes: z.array(z.string()).default([]),
  varieties: z.array(z.string()).default([]),
  origins: z.array(z.string()).default([]),
  colors: z.array(z.string()).default([]),
  shapes: z.array(z.string()).default([]),
  treatments: z.array(z.string()).default([]),
  minWeightCt: z.number().nullable().default(null),
  maxWeightCt: z.number().nullable().default(null),
  budgetMin: z.number().nullable().default(null),
  budgetMax: z.number().nullable().default(null),
  currency: z.string().default("LKR"),
});

export type CustomerPreferences = z.infer<typeof customerPreferencesSchema>;

export function parsePreferences(v: unknown): CustomerPreferences {
  const raw = typeof v === "string" ? safeJson(v) : v;
  const parsed = customerPreferencesSchema.safeParse(raw);
  return parsed.success ? parsed.data : customerPreferencesSchema.parse({});
}

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}

export function splitCsv(input: FormDataEntryValue | null): string[] {
  if (typeof input !== "string" || !input.trim()) return [];
  return input.split(",").map((s) => s.trim()).filter(Boolean);
}
