import { ChevronRight } from "lucide-react";
import type { StoneDto, TimelineItemDto } from "@/lib/partner-dto";
import { fmtDate } from "./portal-ui";

export interface ProvenanceContext {
  byKey: ReadonlyMap<string, StoneDto>;
  kids: readonly StoneDto[];
  timeline: readonly TimelineItemDto[] | null;
}

// Chips come only from the DTO (the stone's parent and children inside this deal, plus approved timeline events); never links, never ids.
export function provenanceChips(stone: StoneDto, ctx: ProvenanceContext): string[] {
  const chips: string[] = [];
  const parent = stone.parentKey ? ctx.byKey.get(stone.parentKey) : undefined;
  const event = (type: TimelineItemDto["type"], keys: (string | undefined)[]) =>
    ctx.timeline?.find((t) => t.type === type && t.stoneKey !== null && keys.includes(t.stoneKey));

  const acquired = event("ACQUIRED", [stone.key]);
  if (acquired) chips.push(`Acquired ${fmtDate(acquired.on)}`);
  if (parent) chips.push(`Cut from ${parent.displayName}`);
  const cut = event("CUTTING_COMPLETED", [stone.key, parent?.key]);
  if (cut) chips.push(`Cutting completed ${fmtDate(cut.on)}`);
  if (stone.kind === "ROUGH" && ctx.kids.length > 0) {
    chips.push(`Cut into ${ctx.kids.length} ${ctx.kids.length === 1 ? "gem" : "gems"}`);
  }
  const registered = stone.kind === "GEM" ? event("GEM_REGISTERED", [stone.key]) : undefined;
  if (registered) chips.push(`Finished stone registered ${fmtDate(registered.on)}`);
  return chips;
}

export function PublicProvenance({ stone, ctx }: { stone: StoneDto; ctx: ProvenanceContext }) {
  const chips = provenanceChips(stone, ctx);
  if (chips.length === 0) return null;
  return (
    <ol aria-label="Where this stone comes from" className="flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span className="inline-flex min-h-[28px] items-center rounded-full border bg-secondary/40 px-2.5 py-0.5 text-xs">{c}</span>
          {i < chips.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
