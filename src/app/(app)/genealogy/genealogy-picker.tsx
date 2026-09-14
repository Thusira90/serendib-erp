"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Diamond } from "lucide-react";

type Option = { id: string; code: string; label: string };

export function GenealogyPicker({
  options,
  currentId,
}: {
  options: Option[];
  currentId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Diamond className="h-4 w-4 text-sgs-teal-500" />
      <select
        value={currentId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          start(() => router.push(v ? `/genealogy?rough=${v}` : "/genealogy"));
        }}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[280px]"
      >
        <option value="">— Select a rough stone —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.code} · {o.label}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs text-muted-foreground">Loading…</span>}
    </div>
  );
}
