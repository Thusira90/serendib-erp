"use client";

import { useEffect, useRef } from "react";

/**
 * Full-bleed cover for a stone's profile card: the main photo if there is one,
 * otherwise the stone's video playing muted on a loop. Place it inside a
 * `relative` container; a shade along the bottom keeps the white text legible
 * without dulling the picture.
 */
export function StoneCoverMedia({
  still, video, alt,
}: {
  still?: string | null;
  video?: string | null;
  alt: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // React does not always emit the muted attribute, and browsers only autoplay muted video.
  useEffect(() => { if (ref.current) ref.current.muted = true; }, [video]);

  if (!still && !video) return null;
  return (
    <>
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={still} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <video
          ref={ref}
          src={`${video}#t=0.1`}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          aria-label={`Video of ${alt}`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
    </>
  );
}
