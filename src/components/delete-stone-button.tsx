"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Permanently deletes a stone (rough or cut) through the given server
 * action. The parent page must gate rendering on SUPER_ADMIN; the action
 * enforces it again as a safety net.
 */
export function DeleteStoneButton({
  id, code, action,
}: {
  id: string;
  code: string;
  action: (fd: FormData) => Promise<{ error: string } | undefined>;
}) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(async () => {
        const res = await action(fd);
        if (res?.error) alert(res.error);
      })}
      onSubmit={(e) => {
        if (!confirm(`Permanently delete ${code} and all its costs, certificates, media and history? This cannot be undone.`)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="text-red-600 hover:text-red-700">
        <Trash2 className="h-4 w-4" /> {pending ? "Deleting…" : "Delete"}
      </Button>
    </form>
  );
}
