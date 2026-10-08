"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Gem, Maximize2, Play, X } from "lucide-react";
import { isVideoAsset } from "@/lib/media";

export type ViewerItem = {
  url: string;
  contentType?: string | null;
  kind?: string | null;
  caption?: string | null;
};

/**
 * Customer-facing media for one stone: a stage showing the current photo or
 * video, a thumbnail strip, and a full-screen view you can step through with
 * arrows, keys or swipes. Videos always play muted (the sound controls are
 * hidden and any unmute is undone) and keep play/pause and a seek bar.
 */
export function StoneMediaViewer({
  items, alt, aspect = "aspect-[16/10]",
}: {
  items: ViewerItem[];
  alt: string;
  aspect?: string;
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = items.length;

  const go = useCallback((step: number) => setIndex((i) => (i + step + count) % count), [count]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, go]);

  if (count === 0) {
    return (
      <div className={`${aspect} bg-sgs-gradient relative grid place-items-center text-white/70`}>
        <Gem className="h-12 w-12" />
      </div>
    );
  }

  const current = items[Math.min(index, count - 1)];
  const video = isVideoAsset(current);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchX.current == null || count < 2) return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      touchX.current = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    },
  };

  return (
    <div>
      <div className={`group relative overflow-hidden bg-sgs-gradient ${aspect}`} {...swipe}>
        {video ? (
          <MutedVideo
            key={current.url}
            src={current.url}
            autoPlay
            loop
            label={`Video of ${alt}`}
            className="absolute inset-0 h-full w-full bg-black object-contain transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="View photo full screen"
            className="absolute inset-0 block h-full w-full cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.url}
              alt={`${alt} — ${index + 1} of ${count}`}
              draggable={false}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="View full screen"
          className="absolute right-3 top-3 rounded-full bg-black/45 p-2 text-white opacity-90 backdrop-blur transition hover:bg-black/65"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        {count > 1 && (
          <>
            <ArrowButton side="left" onClick={() => go(-1)} />
            <ArrowButton side="right" onClick={() => go(1)} />
            <div className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white backdrop-blur">
              {index + 1} / {count}
            </div>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto bg-white p-3">
          {items.map((item, i) => (
            <button
              key={`${item.url}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show ${isVideoAsset(item) ? "video" : "photo"} ${i + 1}`}
              aria-current={i === index}
              className={`group/thumb relative h-16 w-16 shrink-0 overflow-hidden rounded-md border ${
                i === index ? "ring-2 ring-sgs-teal-500" : "opacity-80 hover:opacity-100"
              }`}
            >
              {isVideoAsset(item) ? (
                <>
                  <video
                    src={`${item.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="pointer-events-none h-full w-full bg-black object-cover transition-transform duration-300 group-hover/thumb:scale-110"
                  />
                  <span className="absolute inset-0 grid place-items-center bg-black/25 text-white">
                    <Play className="h-4 w-4 fill-current" />
                  </span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover/thumb:scale-110"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {open && <Lightbox
        item={current}
        alt={alt}
        position={`${index + 1} / ${count}`}
        many={count > 1}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onClose={() => setOpen(false)}
        swipe={swipe}
      />}
    </div>
  );
}

function ArrowButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white backdrop-blur transition hover:bg-black/65 ${side === "left" ? "left-3" : "right-3"}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function Lightbox({
  item, alt, position, many, onPrev, onNext, onClose, swipe,
}: {
  item: ViewerItem;
  alt: string;
  position: string;
  many: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  swipe: { onTouchStart: (e: React.TouchEvent) => void; onTouchEnd: (e: React.TouchEvent) => void };
}) {
  // Rendered into <body> so it sits above the page's own stacking layers and banners.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} media`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 animate-in fade-in duration-200"
      onClick={onClose}
      {...swipe}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        autoFocus
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/25"
      >
        <X className="h-5 w-5" />
      </button>
      {many && (
        <>
          <LightboxArrow side="left" onClick={onPrev} />
          <LightboxArrow side="right" onClick={onNext} />
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
            {position}
          </div>
        </>
      )}
      <div className="animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
        {isVideoAsset(item) ? (
          <MutedVideo
            key={item.url}
            src={item.url}
            autoPlay
            loop
            label={`Video of ${alt}`}
            className="max-h-[85vh] max-w-[92vw] rounded-lg bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={alt} draggable={false} className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain" />
        )}
      </div>
    </div>,
    document.body,
  );
}

function LightboxArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/25 ${side === "left" ? "left-4" : "right-4"}`}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}

function MutedVideo({
  src, className, autoPlay, loop, label,
}: {
  src: string;
  className: string;
  autoPlay?: boolean;
  loop?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // React does not always emit the muted attribute, and browsers only autoplay muted video.
  useEffect(() => { if (ref.current) ref.current.muted = true; }, [src]);
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={ref}
      src={src}
      className={`sgs-muted-video ${className}`}
      muted
      controls
      playsInline
      preload="metadata"
      autoPlay={autoPlay}
      loop={loop}
      controlsList="nodownload noremoteplayback"
      disablePictureInPicture
      disableRemotePlayback
      aria-label={label}
      onVolumeChange={(e) => { if (!e.currentTarget.muted) e.currentTarget.muted = true; }}
    />
  );
}
