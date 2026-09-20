import "server-only";
import { prisma } from "@/lib/db";

/**
 * A single media item positioned on the stone's full lifecycle timeline,
 * with the surface it was captured on so viewers can navigate back to it.
 */
export type LifecycleAsset = {
  id: string;
  url: string;
  kind: string;
  stage: string | null;
  caption: string | null;
  contentType: string | null;
  isPrimary: boolean;
  when: Date;                 // capturedAt ?? createdAt — sortable
  captured: boolean;          // true if capturedAt was set, false = upload-time only
  source: {
    kind: "ROUGH" | "CUTTING" | "GEMSTONE";
    id: string;
    code: string;
    label: string;            // e.g. "SGS-R-2026-000147 · Sapphire"
    href: string;
  };
};

/**
 * Given a rough stone id, gather every media asset attached to that rough
 * PLUS its cutting jobs PLUS the gemstones that came out of those jobs,
 * sorted from earliest to latest by capturedAt||createdAt.
 *
 * The result is what powers the "day one to the last day" timeline.
 */
export async function buildLifecycleForRough(roughId: string): Promise<LifecycleAsset[]> {
  const r = await prisma.roughStone.findUnique({
    where: { id: roughId },
    include: {
      digitalAssets: true,
      cuttingJobs: {
        include: {
          digitalAssets: true,
          transformation: {
            include: {
              outputs: { include: { gemstone: { include: { digitalAssets: true } } } },
            },
          },
        },
      },
    },
  });
  if (!r) return [];

  const items: LifecycleAsset[] = [];

  const push = (
    a: {
      id: string; url: string; kind: string; stage: string | null;
      caption: string | null; contentType: string | null;
      isPrimary: boolean; createdAt: Date; capturedAt: Date | null;
    },
    source: LifecycleAsset["source"],
  ) => {
    items.push({
      id: a.id, url: a.url, kind: a.kind, stage: a.stage,
      caption: a.caption, contentType: a.contentType, isPrimary: a.isPrimary,
      when: a.capturedAt ?? a.createdAt,
      captured: !!a.capturedAt,
      source,
    });
  };

  const roughLabel = `${r.gemType}${r.variety ? ` · ${r.variety}` : ""}`;
  r.digitalAssets.forEach((a) => push(a, {
    kind: "ROUGH", id: r.id, code: r.code,
    label: `${r.code} · ${roughLabel}`,
    href: `/rough/${r.id}`,
  }));

  for (const j of r.cuttingJobs) {
    j.digitalAssets.forEach((a) => push(a, {
      kind: "CUTTING", id: j.id, code: j.code,
      label: `${j.code} · cutting job`,
      href: `/cutting/${j.id}`,
    }));
    for (const out of j.transformation?.outputs ?? []) {
      const g = out.gemstone;
      const gLabel = `${g.gemType}${g.variety ? ` · ${g.variety}` : ""}`;
      g.digitalAssets.forEach((a) => push(a, {
        kind: "GEMSTONE", id: g.id, code: g.code,
        label: `${g.code} · ${gLabel}`,
        href: `/gemstones/${g.id}`,
      }));
    }
  }

  items.sort((a, b) => a.when.getTime() - b.when.getTime());
  return items;
}

/**
 * Given a gemstone id, find its parent rough (if any) and return the full
 * lifecycle from that rough's perspective — so a gemstone detail page can
 * show the same "day one" journey as the rough page.
 *
 * If the gemstone has no parent rough (direct-acquisition faceted stone),
 * we still return the gem's own media as a mini-timeline.
 */
export async function buildLifecycleForGemstone(gemstoneId: string): Promise<LifecycleAsset[]> {
  const gem = await prisma.gemstone.findUnique({
    where: { id: gemstoneId },
    include: {
      digitalAssets: true,
      transformationsAsOutput: {
        include: { transformation: { include: { inputs: true } } },
      },
    },
  });
  if (!gem) return [];

  // Find upstream rough(s) — usually one, but we handle merges.
  const roughIds = Array.from(new Set(
    gem.transformationsAsOutput.flatMap((o) => o.transformation.inputs.map((i) => i.roughStoneId)),
  ));

  if (roughIds.length === 0) {
    // No parent — just show this gem's own media.
    const gLabel = `${gem.gemType}${gem.variety ? ` · ${gem.variety}` : ""}`;
    return gem.digitalAssets
      .map((a) => ({
        id: a.id, url: a.url, kind: a.kind, stage: a.stage,
        caption: a.caption, contentType: a.contentType, isPrimary: a.isPrimary,
        when: a.capturedAt ?? a.createdAt,
        captured: !!a.capturedAt,
        source: {
          kind: "GEMSTONE" as const,
          id: gem.id, code: gem.code,
          label: `${gem.code} · ${gLabel}`,
          href: `/gemstones/${gem.id}`,
        },
      }))
      .sort((a, b) => a.when.getTime() - b.when.getTime());
  }

  const chunks = await Promise.all(roughIds.map((id) => buildLifecycleForRough(id)));
  const merged = chunks.flat();
  // De-dupe (a rough shared across multiple transformations would repeat).
  const seen = new Set<string>();
  return merged
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .sort((a, b) => a.when.getTime() - b.when.getTime());
}
