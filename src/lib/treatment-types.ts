// Pure definitions for treatments (safe for server and client).

export const TREATMENT_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type TreatmentStatus = (typeof TREATMENT_STATUSES)[number];

export const TREATMENT_STATUS_LABEL: Record<TreatmentStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const TREATMENT_STATUS_BADGE: Record<TreatmentStatus, "muted" | "warning" | "success" | "purple"> = {
  PLANNED: "muted",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "purple",
};

export const PROVIDER_KINDS = [
  { value: "COMPANY", label: "Company" },
  { value: "PERSON", label: "Person" },
  { value: "IN_HOUSE", label: "In-house" },
] as const;

export type StoneKind = "ROUGH" | "GEMSTONE";

/** A treatment as the pages and dialogs see it (dates as ISO strings, money as numbers). */
export type TreatmentRow = {
  id: string;
  code: string;
  kind: StoneKind;
  stoneId: string;
  stoneCode: string;
  stoneLabel: string;
  type: string;
  status: TreatmentStatus;
  providerKind: string | null;
  providerName: string | null;
  providerContact: string | null;
  startDate: string | null;
  endDate: string | null;
  cost: number;
  currency: string;
  weightBeforeCt: number | null;
  weightAfterCt: number | null;
  notes: string | null;
};

const DAY = 86_400_000;

/**
 * Days a treatment took (start to end). While still in progress the end is today,
 * so the figure counts up. Null when there is no start date to count from.
 */
export function treatmentDays(start: string | Date | null, end: string | Date | null, status: string, now = new Date()): number | null {
  if (!start) return null;
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : status === "IN_PROGRESS" ? now.getTime() : null;
  if (to == null || Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / DAY));
}

export const isTreatmentStatus = (v: unknown): v is TreatmentStatus =>
  typeof v === "string" && (TREATMENT_STATUSES as readonly string[]).includes(v);
