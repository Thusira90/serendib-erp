"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { seedChartOfAccounts } from "./actions";

export function SeedCoaButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="accent"
      disabled={pending}
      onClick={() => start(async () => { await seedChartOfAccounts(); })}
    >
      <Sparkles className="h-4 w-4" /> {pending ? "Seeding…" : "Seed default Chart of Accounts"}
    </Button>
  );
}
