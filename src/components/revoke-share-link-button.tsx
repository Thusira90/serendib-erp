"use client";

import { useState, useTransition } from "react";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revokeShareLink } from "@/app/(app)/share-links/actions";

/** Revokes one share link after a confirm; the public URL stops working at once. */
export function RevokeShareLinkButton({ id, code }: { id: string; code: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function revoke() {
    if (!confirm(`Revoke share link ${code}? Anyone who has the link will immediately lose access. This cannot be undone.`)) return;
    setError(null);
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("id", id);
        await revokeShareLink(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not revoke the link.");
      }
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" onClick={revoke} disabled={pending} className="text-red-700 hover:text-red-800">
        <Ban className="h-3.5 w-3.5" /> {pending ? "Revoking…" : "Revoke"}
      </Button>
      {error && <div className="text-xs text-red-700">{error}</div>}
    </div>
  );
}
