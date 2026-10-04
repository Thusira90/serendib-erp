"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PortalPrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" size="lg" onClick={() => window.print()}>
      <Printer className="h-4 w-4" /> {label}
    </Button>
  );
}
