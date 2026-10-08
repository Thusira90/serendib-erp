"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setCgiEnabled } from "../edit-actions";

/**
 * Per-stone Ceylon Gem Identity switch. Small stones often do not need CGI;
 * a stone can be switched on later when a customer asks for it.
 */
export function CgiSwitchCard({ gemstoneId, enabled, canEdit }: { gemstoneId: string; enabled: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function flip() {
    start(async () => {
      setError(null);
      try { await setCgiEnabled(gemstoneId, !enabled); }
      catch (e) { setError((e as Error).message); }
    });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ceylon Gem Identity</div>
            <div className="text-sm font-medium mt-0.5">{enabled ? "CGI is on for this stone" : "CGI is off for this stone"}</div>
          </div>
          <span className={`mt-0.5 inline-flex h-2.5 w-2.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden />
        </div>
        <p className="text-xs text-muted-foreground">
          {enabled
            ? "Its score and breakdown show on the stone page, labels, catalogue, share links and the QR scan page. Turn it off for stones that don't need one."
            : "No CGI score, badge or breakdown shows for this stone anywhere, inside or outside the app. Any grading already entered is kept."}
        </p>
        {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{error}</div>}
        {canEdit && (
          <Button type="button" size="sm" variant={enabled ? "outline" : "accent"} disabled={pending} onClick={flip}>
            {pending ? "Saving…" : enabled ? "Turn CGI off" : "Turn CGI on"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
