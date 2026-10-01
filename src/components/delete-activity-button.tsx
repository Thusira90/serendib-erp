"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { deleteAuditEntry } from "@/app/(app)/actions";

/**
 * Small trash button that removes one row from the Recent Activity feed.
 * The parent server component must gate rendering on SUPER_ADMIN; this
 * button assumes the check has already been made (the server action
 * enforces it again as a safety net).
 */
export function DeleteActivityButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(async () => { await deleteAuditEntry(fd); })}
      onSubmit={(e) => { if (!confirm("Remove this entry from the recent activity feed?")) e.preventDefault(); }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        aria-label="Remove entry"
        title="Remove entry"
        className="opacity-40 hover:opacity-100 hover:text-red-600 disabled:opacity-30 transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
