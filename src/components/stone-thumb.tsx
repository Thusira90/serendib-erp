import { Gem, Play } from "lucide-react";
import { isVideoAsset } from "@/lib/media";

/**
 * Fills its `relative` parent with a stone's cover: the photo, or for a video a
 * still frame of it (it never plays here). With no media at all it shows a soft
 * placeholder, never a dark block.
 */
export function StoneThumb({
  cover, alt,
}: {
  cover: { url: string; contentType?: string | null; kind?: string | null } | null;
  alt: string;
}) {
  if (!cover) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-sgs-gradient-soft text-sgs-purple-300">
        <Gem className="h-10 w-10" />
      </div>
    );
  }
  if (isVideoAsset(cover)) {
    return (
      <>
        {/* #t=0.1 makes the browser paint a frame (iOS Safari otherwise shows nothing) without playing it. */}
        <video
          src={`${cover.url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          aria-label={`Video of ${alt}`}
          className="pointer-events-none absolute inset-0 h-full w-full bg-secondary object-cover"
        />
        <span className="absolute bottom-2 right-2 rounded-full bg-black/55 p-1.5 text-white" aria-hidden>
          <Play className="h-3.5 w-3.5 fill-current" />
        </span>
      </>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cover.url} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
  );
}
