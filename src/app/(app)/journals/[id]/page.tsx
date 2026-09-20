import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ReverseJournalButton } from "./reverse-button";
import { BookOpen, ChevronLeft, ExternalLink } from "lucide-react";

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireCapability("accounting:read");
  const canWrite = can(session.user.role, "accounting:write");
  const journal = await prisma.journal.findUnique({
    where: { id },
    include: {
      period: true,
      lines: { include: { account: true }, orderBy: { displayOrder: "asc" } },
      reversalOf: true,
      reversedBy: true,
    },
  });
  if (!journal) notFound();

  const canReverse = canWrite && journal.status === "POSTED" && journal.sourceModule === "MANUAL";
  const sourceLink = journal.sourceModule === "CAPITAL" && journal.sourceId
    ? `/capital`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/journals" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to journals
        </Link>
        <div className="flex items-end justify-between gap-4 mt-2">
          <div>
            <h1 className="font-serif text-3xl flex items-center gap-3">
              <BookOpen className="h-7 w-7 text-sgs-teal-500" /> {journal.code}
            </h1>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <span>{formatDate(journal.transactionDate)}</span>
              <span>·</span>
              <span className="font-mono">Period {journal.period.year}-{String(journal.period.month).padStart(2, "0")}</span>
              <span>·</span>
              <Badge variant={journal.status === "POSTED" ? "success" : journal.status === "REVERSED" ? "danger" : "muted"}>
                {journal.status}
              </Badge>
            </div>
          </div>
          {canReverse && <ReverseJournalButton id={journal.id} code={journal.code} />}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</div>
            <div>{journal.description}</div>
          </div>
          {journal.reference && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Reference</div>
              <div>{journal.reference}</div>
            </div>
          )}
          <div className="flex gap-8">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Source</div>
              <div>
                <Badge variant="muted">{journal.sourceModule}</Badge>
                {journal.sourceCode && (
                  <>
                    {" "}
                    {sourceLink ? (
                      <Link href={sourceLink} className="text-sgs-teal-700 hover:underline font-mono text-xs inline-flex items-center gap-1">
                        {journal.sourceCode} <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="font-mono text-xs">{journal.sourceCode}</span>
                    )}
                  </>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Posted by</div>
              <div>{journal.postedBy ?? "—"}</div>
            </div>
          </div>
          {(journal.reversalOf || journal.reversedBy) && (
            <div className="pt-2 border-t space-y-1">
              {journal.reversalOf && (
                <div className="text-xs">
                  This is a reversal of{" "}
                  <Link href={`/journals/${journal.reversalOf.id}`} className="text-sgs-teal-700 hover:underline font-mono">
                    {journal.reversalOf.code}
                  </Link>
                </div>
              )}
              {journal.reversedBy && (
                <div className="text-xs">
                  Reversed by{" "}
                  <Link href={`/journals/${journal.reversedBy.id}`} className="text-sgs-teal-700 hover:underline font-mono">
                    {journal.reversedBy.code}
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Account</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journal.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.account.code}</TableCell>
                  <TableCell className="text-sm">{l.account.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.description ?? "—"}</TableCell>
                  <TableCell className="text-right num">{Number(l.debit) === 0 ? "—" : formatCurrency(Number(l.debit), journal.currency)}</TableCell>
                  <TableCell className="text-right num">{Number(l.credit) === 0 ? "—" : formatCurrency(Number(l.credit), journal.currency)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-medium">
                <TableCell colSpan={3} className="text-right">Total</TableCell>
                <TableCell className="text-right num">{formatCurrency(Number(journal.totalAmount), journal.currency)}</TableCell>
                <TableCell className="text-right num">{formatCurrency(Number(journal.totalAmount), journal.currency)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
