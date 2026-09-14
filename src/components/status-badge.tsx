import { Badge } from "@/components/ui/badge";
import type { CuttingJobStatus, GemstoneStatus, RoughStatus } from "@/lib/enums";

const roughVariant: Record<RoughStatus, "muted" | "teal" | "purple" | "success" | "warning" | "danger" | "accent"> = {
  PURCHASED: "muted",
  RECEIVED: "teal",
  INSPECTED: "teal",
  AVAILABLE: "success",
  RESERVED: "warning",
  IN_CUTTING: "purple",
  CUT: "purple",
  CONVERTED: "muted",
  SOLD: "accent",
  LOST: "danger",
};

const gemVariant: Record<GemstoneStatus, "muted" | "teal" | "purple" | "success" | "warning" | "danger" | "accent"> = {
  IN_PROGRESS: "purple",
  AVAILABLE: "success",
  RESERVED: "warning",
  SOLD: "accent",
  ARCHIVED: "muted",
  LOST: "danger",
};

const jobVariant: Record<CuttingJobStatus, "muted" | "teal" | "purple" | "success" | "warning" | "danger"> = {
  PENDING: "muted",
  ASSIGNED: "teal",
  IN_PROGRESS: "purple",
  QUALITY_CHECK: "warning",
  COMPLETED: "success",
  REJECTED: "danger",
  REWORK: "warning",
};

export function StatusBadge({
  status,
  kind,
}: {
  status: string;
  kind: "rough" | "gemstone" | "cuttingJob";
}) {
  const variant =
    kind === "rough" ? roughVariant[status as RoughStatus] :
    kind === "gemstone" ? gemVariant[status as GemstoneStatus] :
    jobVariant[status as CuttingJobStatus];
  const label = status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge variant={variant ?? "muted"}>{label}</Badge>;
}
