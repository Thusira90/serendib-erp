import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  size?: number;
  showWordmark?: boolean;
  variant?: "color" | "mono";
};

/**
 * The official SGS interlocked-diamonds mark.
 * - `variant="color"` (default) renders the real logo file from /serendib-logo.jpg.
 * - `variant="mono"` renders an inline SVG in currentColor so it can sit on
 *   a coloured background (login gradient, dark headers) and inherit the
 *   surrounding text colour.
 */
export function SgsMark({ className, size = 40, variant = "color" }: LogoProps) {
  if (variant === "mono") {
    return (
      <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-hidden>
        <path
          d="M50 60 L100 40 L150 60 L150 105 L100 130 L50 105 Z"
          fill="none" stroke="currentColor" strokeWidth="10" strokeLinejoin="miter"
        />
        <path
          d="M40 100 L90 80 L140 100 L140 145 L90 170 L40 145 Z"
          fill="none" stroke="currentColor" strokeWidth="10" strokeLinejoin="miter"
          transform="translate(10, 5)"
        />
      </svg>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/serendib-logo.jpg"
      alt="Serendib Gemstones"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function SgsLogo({ className, size = 40, showWordmark = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <SgsMark size={size} />
      {showWordmark && (
        <div className="leading-tight">
          <div className="font-serif text-lg tracking-tight text-sgs-teal-700">
            Serendib
          </div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-sgs-purple-500 -mt-0.5">
            Gemstones
          </div>
        </div>
      )}
    </div>
  );
}
