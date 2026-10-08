"use client";

import { useState } from "react";
import { Eye, Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

type Width = "desktop" | "phone";

/**
 * Banner plus width toggle around the server-rendered partner page. The page itself is passed in as children,
 * so the preview is the very component the partner sees, not a copy of it.
 */
export function PreviewFrame({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const [width, setWidth] = useState<Width>("desktop");

  return (
    <div className="space-y-4">
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sgs-purple-200 bg-sgs-purple-50 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2 text-sm text-sgs-purple-900">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">Preview - exactly what the partner sees; not logged</p>
            <div className="text-xs text-sgs-purple-800">{summary}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div role="group" aria-label="Preview width" className="inline-flex rounded-md border bg-background p-0.5">
            {([
              ["desktop", "Desktop", Monitor],
              ["phone", "Phone", Smartphone],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={width === value}
                onClick={() => setWidth(value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors",
                  width === value ? "bg-sgs-teal-500 text-white" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <p className="max-w-[260px] text-right text-[11px] text-muted-foreground">
            Phone narrows the page. Layouts that switch on screen size follow your browser window.
          </p>
        </div>
      </div>

      <div
        className={cn(
          "mx-auto w-full overflow-hidden rounded-lg border bg-sgs-bone shadow-luxe transition-[max-width] duration-200",
          width === "phone" ? "max-w-[390px]" : "max-w-full",
        )}
      >
        {children}
      </div>
    </div>
  );
}
