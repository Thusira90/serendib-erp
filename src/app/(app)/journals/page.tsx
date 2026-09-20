import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BookOpen, Plus, ExternalLink } from "lucide-react";

export default async function JournalsPage() {
  const session = await requireCapability("accounting:read");
  const canWrite = can(session.user.role, "accounting:write");
  const journals = await prisma.journal.findMany({
    orderBy: { transactionDate: "desc" },
    take: 200,
    include: { period: true, _count: { select: { lines: true } } },
  });

  const posted = journals.filter((j) => j.status === "POSTED").length;
  const reversed = journals.filter((j) => j.status === "REVERSED").length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3">
            <BookOpen className="h-7 w-7 text-sgs-teal-500" /> Journals
          </h1>
          <p className="text-sm text-muted-foreground">
            Every double-entry posting in the ledger. Auto-posted entries come from other modules;
            manual entries can be posted here for adjustments the modules don't cover.
          </p>
        </div>
        {canWrite && (
          <Button asChild variant="accent">
            <Link href="/journals/new"><Plus className="h-4 w-4" /> New manual journal</Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total entries" value={String(journals.length)} />
        <Stat label="Posted" value={String(posted)} />
        <Stat label="Reversed" value={String(reversed)} />
        <Stat label="Manual" value={String(journals.filter((j) => j.sourceModule === "MANUAL").length)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Recent entries</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                    No journal entries yet. Auto-posting activates as soon as you seed the Chart of Accounts.
                  </TableCell>
                </TableRow>
              )}
              {journals.map((j) => (
                <TableRow key={j.id} className={j.status === "REVERSED" ? "opacity-60" : ""}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/journals/${j.id}`} className="text-sgs-teal-700 hover:underline">{j.code}</Link>
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(j.transactionDate)}</TableCell>
                  <TableCell className="text-xs font-mono">{j.period.year}-{String(j.period.month).padStart(2, "0")}</TableCell>
                  <TableCell className="text-sm max-w-md truncate">{j.description}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="muted">{j.sourceModule}</Badge>
                    {j.sourceCode && <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{j.sourceCode}</div>}
                  </TableCell>
                  <TableCell className="text-right num text-xs">{formatCurrency(Number(j.totalAmount), j.currency)}</TableCell>
                  <TableCell className="text-xs">{j._count.lines}</TableCell>
                  <TableCell>
                    <Badge variant={j.status === "POSTED" ? "success" : j.status === "REVERSED" ? "danger" : "muted"}>
                      {j.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-serif text-2xl num mt-1">{value}</div>
    </CardContent></Card>
  );
}
