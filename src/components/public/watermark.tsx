import { cn } from "@/lib/utils";

const CELLS = 60;
const MAX_NAME = 60;

/**
 * Strong confidentiality watermark: the viewer's name tiled across the whole screen at an angle,
 * above the content (so photos carry it too) and on every printed page. Text, not a background image,
 * so it prints regardless of the browser's "background graphics" setting. `contained` keeps it inside
 * its parent (admin preview) instead of covering the whole window.
 */
export function Watermark({ forName, label = "Serendib Gemstones", contained = false }: {
  forName: string;
  label?: string;
  contained?: boolean;
}) {
  const name = forName.length > MAX_NAME ? `${forName.slice(0, MAX_NAME - 1)}…` : forName;
  return (
    <div
      aria-hidden="true"
      data-watermark={contained ? "contained" : "fixed"}
      className={cn(
        "pointer-events-none z-40 select-none overflow-hidden",
        contained ? "sticky top-0 -mb-[100vh] h-screen" : "fixed inset-0",
      )}
    >
      <div className="absolute -inset-[45%] grid -rotate-[24deg] auto-rows-fr grid-cols-3 text-sgs-purple-600 opacity-[0.12] sm:grid-cols-5 print:opacity-[0.18]">
        {Array.from({ length: CELLS }, (_, i) => (
          <div key={i} className="flex flex-col items-center justify-center px-2 text-center">
            <span className="break-words text-sm font-semibold uppercase tracking-[0.18em] sm:text-lg">{name}</span>
            <span className="mt-0.5 text-[9px] uppercase tracking-[0.3em]">Confidential &middot; {label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
