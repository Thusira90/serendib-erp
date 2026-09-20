import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { MEDIA_STAGE_LABEL, type MediaStage } from "@/lib/enums";
import type { LifecycleAsset } from "@/lib/stone-lifecycle";
import { Diamond, Scissors, Gem } from "lucide-react";

const SOURCE_STYLE = {
  ROUGH:    { icon: Diamond, badge: "teal"   as const, accent: "bg-sgs-teal-500" },
  CUTTING:  { icon: Scissors,badge: "purple" as const, accent: "bg-sgs-purple-500" },
  GEMSTONE: { icon: Gem,     badge: "success" as const, accent: "bg-emerald-500" },
};

export function LifecycleTimeline({ items }: { items: LifecycleAsset[] }) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-8 text-center border rounded-lg">
        No media captured yet. Upload photos and videos on the rough, cutting job, or
        finished gemstone to build the full journey.
      </div>
    );
  }

  return (
    <ol className="relative border-l-2 border-secondary pl-6 space-y-6">
      {items.map((a) => {
        const s = SOURCE_STYLE[a.source.kind];
        const Icon = s.icon;
        const isVideo = a.contentType?.startsWith("video/");
        return (
          <li key={a.id} className="relative">
            <span className={`absolute -left-[35px] top-1 flex h-6 w-6 items-center justify-center rounded-full ${s.accent} text-white shadow`}>
              <Icon className="h-3 w-3" />
            </span>
            <div className="flex items-baseline gap-2 flex-wrap">
              <Badge variant={s.badge}>{a.source.kind}</Badge>
              {a.stage && <Badge variant="muted">{MEDIA_STAGE_LABEL[a.stage as MediaStage] ?? a.stage}</Badge>}
              <span className="text-xs text-muted-foreground">
                {formatDate(a.when)}{!a.captured && <span className="italic ml-1">(upload date)</span>}
              </span>
            </div>
            <div className="mt-1 text-sm">
              <Link href={a.source.href} className="text-sgs-teal-700 hover:underline font-mono text-xs">{a.source.code}</Link>
              <span className="text-muted-foreground text-xs"> · {a.source.label.split(" · ")[1] ?? a.kind.replaceAll("_", " ")}</span>
            </div>
            {a.caption && <div className="text-sm mt-1">{a.caption}</div>}
            <Link href={a.url} target="_blank" className="mt-2 block max-w-xs rounded-lg border overflow-hidden hover:ring-1 hover:ring-sgs-teal-500">
              <div className="aspect-video bg-secondary/40">
                {isVideo ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={a.url} className="h-full w-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.caption ?? a.kind} className="h-full w-full object-cover" />
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
