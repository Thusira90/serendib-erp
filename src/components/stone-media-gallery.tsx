import { isVideoAsset } from "@/lib/media";

export type StoneMediaItem = {
  id?: string;
  url: string;
  contentType?: string | null;
  kind?: string | null;
  caption?: string | null;
};

/**
 * Photos and videos of one stone for customer-facing pages. Videos play inline
 * with their own controls; photos are plain tiles. Download and picture-in-
 * picture are switched off on videos to match the "view only" intent of the
 * public pages (a deterrent, not a guarantee).
 */
export function StoneMediaGallery({
  items, alt, title,
}: {
  items: StoneMediaItem[];
  alt: string;
  title?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      {title && <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">{title}</div>}
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((m, i) => (
          <li key={m.id ?? `${m.url}-${i}`} className="aspect-square overflow-hidden rounded-lg border bg-secondary/40">
            {isVideoAsset(m) ? (
              // #t=0.1 makes iOS Safari paint a first frame instead of a blank tile.
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={`${m.url}#t=0.1`}
                className="h-full w-full bg-black object-contain"
                controls
                playsInline
                preload="metadata"
                controlsList="nodownload"
                disablePictureInPicture
                aria-label={`Video of ${alt}`}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt={`${alt} — photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
