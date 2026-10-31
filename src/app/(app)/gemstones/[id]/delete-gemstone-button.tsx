"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteGemstone } from "../delete-actions";

/**
 * Permanently deletes the stone. The parent page must gate rendering on
 * SUPER_ADMIN; the server action enforces it again as a safety net.
 */
export function DeleteGemstoneButton({ id, code }: { id: string; code: string }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(async () => {
        const res = await deleteGemstone(fd);
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
