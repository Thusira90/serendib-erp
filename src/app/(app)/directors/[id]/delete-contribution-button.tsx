"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { deleteCapitalContribution } from "../actions";

export function DeleteContributionButton({ id, code }: { id: string; code: string }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(() => deleteCapitalContribution(fd))}
      onSubmit={(e) => {
        if (!confirm(`Delete contribution ${code}? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button size="icon" variant="ghost" disabled={pending} title="Delete contribution">
        <Trash2 className="h-3.5 w-3.5 text-red-600" />
      </Button>
    </form>
  );
}
