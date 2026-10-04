import type { StoneMediaDto } from "@/lib/partner-dto";
import { Badge } from "@/components/ui/badge";
import { MEDIA_STAGE_LABEL, type MediaStage } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { fmtDate } from "./portal-ui";

const MAX_PER_STONE = 24;

// Defence in depth: the builder already limits media to the media origin, but the view never trusts a scheme it cannot name.
const safeUrl = (u: string): boolean => u.startsWith("https://") || u.startsWith("/uploads/");

const stageLabel = (stage: string | null): string | null =>
  stage && Object.prototype.hasOwnProperty.call(MEDIA_STAGE_LABEL, stage) ? MEDIA_STAGE_LABEL[stage as MediaStage] : null;

export function PublicMediaStrip({ media, name }: { media: StoneMediaDto[]; name: string }) {
  const items = media.filter((m) => safeUrl(m.url)).slice(0, MAX_PER_STONE);
  if (items.length === 0) return null;
  return (
    <ul aria-label={`Photos and videos of ${name}`} className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {items.map((m, i) => {
        const stage = stageLabel(m.stage);
        return (
          <li key={i} className={cn("avoid-break overflow-hidden rounded-lg border bg-white", m.primary && "ring-2 ring-sgs-teal-500")}>
            <div className="aspect-square bg-secondary/40">
              {m.kind === "VIDEO" ? (
                <video
                  src={m.url}
                  className="h-full w-full object-cover"
                  controls
                  muted
                  playsInline
                  preload="none"
                  controlsList="nodownload"
                  aria-label={m.caption ?? `Video of ${name}`}
                />
              ) : (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-full min-h-[44px] w-full"
                  aria-label={`Open photo of ${name} full size`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.url}
                    alt={m.caption ?? `Photo of ${name}`}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </a>
              )}
            </div>
            {(stage || m.primary || m.on || m.caption) && (
              <div className="space-y-1 p-2">
                {(stage || m.primary) && (
                  <div className="flex flex-wrap items-center gap-1">
                    {stage && <Badge variant="teal">{stage}</Badge>}
                    {m.primary && <Badge variant="purple">Main photo</Badge>}
                  </div>
                )}
                {m.caption && <p className="line-clamp-3 text-xs text-muted-foreground">{m.caption}</p>}
                {m.on && <p className="num text-[10px] text-muted-foreground">{fmtDate(m.on)}</p>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
