import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getCompanySettings } from "@/lib/company-settings";
import { RecordContributionButton } from "../record-contribution-button";
import { EditDirectorButton } from "./edit-director-button";
import { DeleteContributionButton } from "./delete-contribution-button";
import { Crown, ChevronLeft, FileText } from "lucide-react";

const methodLabel = (m: string) =>
  m.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

export default async function DirectorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireCapability("director:read");
  const canWrite = can(session.user.role, "director:write");

  const [director, allDirectors, company] = await Promise.all([
    prisma.director.findUnique({
      where: { id },
      include: { contributions: { orderBy: { contributedAt: "desc" } } },
    }),
    prisma.director.findMany({ orderBy: { name: "asc" } }),
    getCompanySettings(),
  ]);
  if (!director) notFound();

  const totals = new Map<string, number>();
  for (const c of director.contributions) {
    const amt = Number(c.amount);
    totals.set(c.currency, (totals.get(c.currency) ?? 0) + amt);
  }
  const totalRows = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/directors" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to directors
        </Link>
        <div className="flex items-end justify-between gap-4 mt-2">
          <div>
            <h1 className="font-serif text-3xl flex items-center gap-3">
              <Crown className="h-7 w-7 text-sgs-purple-500" /> {director.name}
            </h1>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <span className="font-mono">{director.code}</span>
              <span>·</span>
              <span>{director.role}</span>
              <span>·</span>
              <Badge variant={director.active ? "success" : "muted"}>
                {director.active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
          {canWrite && (
            <div className="flex gap-2">
              <EditDirectorButton director={{
                id: director.id, name: director.name, role: director.role,
                email: director.email, phone: director.phone,
                nationalId: director.nationalId, address: director.address,
                sharePct: Number(director.sharePct), active: director.active,
                joinedAt: director.joinedAt, leftAt: director.leftAt,
                notes: director.notes,
              }} />
              <RecordContributionButton
                directors={allDirectors.map((d) => ({ id: d.id, name: d.name, code: d.code, active: d.active }))}
                defaultCurrency={company.defaultCurrency}
                presetDirectorId={director.id}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <KV label="Share %" value={`${Number(director.sharePct).toFixed(2)}%`} />
            <KV label="Email" value={director.email ?? "—"} />
            <KV label="Phone" value={director.phone ?? "—"} />
            <KV label="National ID" value={director.nationalId ?? "—"} />
            <KV label="Address" value={director.address ?? "—"} />
            <KV label="Joined" value={formatDate(director.joinedAt)} />
            {director.leftAt && <KV label="Left" value={formatDate(director.leftAt)} />}
            {director.notes && (
              <div className="pt-2 border-t">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</div>
                <div className="text-sm mt-1 whitespace-pre-wrap">{director.notes}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Capital contributed</CardTitle></CardHeader>
          <CardContent>
            {totalRows.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                No contributions recorded yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {totalRows.map(([ccy, amt]) => (
                  <div key={ccy} className="rounded-lg border bg-secondary/40 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{ccy}</div>
                    <div className="font-serif text-2xl num">{formatCurrency(amt, ccy)}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {director.contributions.filter((c) => c.currency === ccy).length} contribution(s)
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Contribution history</CardTitle>
          <div className="text-xs text-muted-foreground">{director.contributions.length} entries</div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Recorded by</TableHead>
                <TableHead>Receipt</TableHead>
                {canWrite && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {director.contributions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canWrite ? 8 : 7} className="text-center text-sm text-muted-foreground py-8">
                    No contributions recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {director.contributions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell className="text-xs">{formatDate(c.contributedAt)}</TableCell>
                  <TableCell className="text-right num font-medium">
                    {formatCurrency(Number(c.amount), c.currency)}
                  </TableCell>
                  <TableCell><Badge variant="muted">{methodLabel(c.method)}</Badge></TableCell>
                  <TableCell className="text-xs">{c.reference ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.recordedBy ?? "—"}</TableCell>
                  <TableCell>
                    {c.receiptUrl ? (
                      <Link href={c.receiptUrl} target="_blank" className="inline-flex items-center gap-1 text-xs text-sgs-teal-700 hover:underline">
                        <FileText className="h-3.5 w-3.5" /> View
                      </Link>
                    ) : "—"}
                  </TableCell>
                  {canWrite && (
                    <TableCell>
                      <DeleteContributionButton id={c.id} code={c.code} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground pt-0.5">{label}</div>
      <div>{value}</div>
    </div>
  );
}
