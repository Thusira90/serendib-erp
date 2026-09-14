"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import Link from "next/link";

export function QrPrintButton({ code, kind }: { code: string; kind: "gemstone" | "rough" }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={`/qr/print?code=${encodeURIComponent(code)}&kind=${kind}`}>
        <Printer className="h-4 w-4" /> Print
      </Link>
    </Button>
  );
}
