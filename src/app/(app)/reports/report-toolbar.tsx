import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { PrintButton } from "@/components/print-button";

export function ReportToolbar({ csvKind }: { csvKind?: string }) {
  return (
    <div className="flex items-center justify-between print:hidden">
      <Link href="/reports" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> All reports
      </Link>
      <div className="flex items-center gap-2">
        {csvKind && (
          <Link
            href={`/reports/export?kind=${csvKind}`}
            className="text-xs border rounded-md px-3 py-1.5 hover:bg-secondary inline-flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Link>
        )}
        <PrintButton />
      </div>
    </div>
  );
}
