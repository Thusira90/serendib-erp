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
  // Free-form "label: value" details about the customer (language, birthday, referred by, ...).
  extras: z.array(z.object({ label: z.string().max(80), value: z.string().max(500) })).max(40).default([]),
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

/** Parse the posted JSON for the extra-information rows; anything malformed is dropped. */
export function parseExtras(input: FormDataEntryValue | null): Array<{ label: string; value: string }> {
  if (typeof input !== "string" || !input.trim()) return [];
  try {
    const raw = JSON.parse(input);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is { label: string; value: string } => typeof r?.label === "string" && typeof r?.value === "string")
      .map((r) => ({ label: r.label.trim().slice(0, 80), value: r.value.trim().slice(0, 500) }))
      .filter((r) => r.label && r.value)
      .slice(0, 40);
  } catch { return []; }
}

export function splitCsv(input: FormDataEntryValue | null): string[] {
  if (typeof input !== "string" || !input.trim()) return [];
  return input.split(",").map((s) => s.trim()).filter(Boolean);
}
