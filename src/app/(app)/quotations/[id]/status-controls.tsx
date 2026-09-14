"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateQuotationStatus } from "@/app/(app)/sales/actions";

export function QuotationStatusControls({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(() => updateQuotationStatus(fd))}
      className="inline-flex items-center gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <select name="status" defaultValue={status} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
        {["DRAFT","SENT","ACCEPTED","DECLINED","EXPIRED"].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <Button size="sm" variant="outline" disabled={pending}>{pending ? "…" : "Save"}</Button>
    </form>
  );
}

