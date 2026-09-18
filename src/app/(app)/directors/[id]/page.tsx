import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EditDirectorButton } from "./edit-director-button";
import { CAPITAL_TXN_META } from "@/lib/enums";
import { Crown, ChevronLeft, FileText, ExternalLink } from "lucide-react";

const methodLabel = (m: string) => m.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

export default async function DirectorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireCapability("director:read");
  const canWrite = can(session.user.role, "director:write");
  const canViewCapital = can(session.user.role, "capital:read");

  const director = await prisma.director.findUnique({
    where: { id },
    include: {
      shareholder: { include: { lots: { include: { shareClass: true } } } },
      capitalTransactions: canViewCapital ? { orderBy: { transactionDate: "desc" } } : false,
    },
  });
  if (!director) notFound();

  const txns = director.capitalTransactions ?? [];
  const totalsByType = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (t.status === "REVERSED") continue;
    const key = t.type;
    const perCcy = totalsByType.get(key) ?? new Map<string, number>();
    perCcy.set(t.currency, (perCcy.get(t.currency) ?? 0) + Number(t.amount));
    totalsByType.set(key, perCcy);
  }

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
            <EditDirectorButton director={{
              id: director.id, name: director.name, role: director.role,
              email: director.email, phone: director.phone,
              nationalId: director.nationalId, address: director.address,
              active: director.active, joinedAt: director.joinedAt,
              leftAt: director.leftAt, notes: director.notes,
            }} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
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
          <CardHeader>
            <CardTitle>Shareholder link</CardTitle>
          </CardHeader>
          <CardContent>
            {director.shareholder ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Link href={`/shareholders/${director.shareholder.id}`} className="text-sgs-teal-700 hover:underline inline-flex items-center gap-1 font-medium">
                    {director.shareholder.name} <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  <Badge variant="muted">{director.shareholder.code}</Badge>
                  <Badge variant="muted">{director.shareholder.kind}</Badge>
                </div>
                {director.shareholder.lots.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    {director.shareholder.lots.map((l) => (
                      <div key={l.id} className="rounded-md border bg-secondary/30 px-3 py-2">
                        <div className="font-medium">{Number(l.numberOfShares).toLocaleString()} {l.shareClass.code}</div>
                        <div className="text-xs text-muted-foreground">
                          Paid-up {formatCurrency(Number(l.paidUpAmount), l.shareClass.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No shares issued to this shareholder yet.</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                This director is not on the share register. If they also hold shares, add them from{" "}
                <Link href="/shareholders" className="text-sgs-teal-700 hover:underline">Shareholders</Link> and link back.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {canViewCapital && (
        <Card>
          <CardHeader>
            <CardTitle>Director-side capital movement</CardTitle>
            <p className="text-xs text-muted-foreground">
              Loans, advances, expenses-paid-on-behalf and withdrawals — see the full{" "}
              <Link href="/capital" className="text-sgs-teal-700 hover:underline">Capital ledger</Link> for the ledger view.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {totalsByType.size > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {Array.from(totalsByType.entries()).map(([type, perCcy]) => (
                  <div key={type} className="rounded-md border bg-secondary/30 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {CAPITAL_TXN_META[type as keyof typeof CAPITAL_TXN_META]?.label ?? type}
                    </div>
                    {Array.from(perCcy.entries()).map(([ccy, amt]) => (
                      <div key={ccy} className="num text-sm font-medium">
                        {formatCurrency(amt, ccy)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      No director-side capital movement yet.
                    </TableCell>
                  </TableRow>
                )}
                {txns.map((t) => {
                  const meta = CAPITAL_TXN_META[t.type as keyof typeof CAPITAL_TXN_META];
                  return (
                    <TableRow key={t.id} className={t.status === "REVERSED" ? "opacity-60" : ""}>
                      <TableCell className="font-mono text-xs">{t.code}</TableCell>
                      <TableCell className="text-xs">{formatDate(t.transactionDate)}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="muted">{meta?.label ?? t.type}</Badge>
                      </TableCell>
                      <TableCell className={`text-right num font-medium ${Number(t.amount) < 0 ? "text-red-600" : ""}`}>
                        {formatCurrency(Number(t.amount), t.currency)}
                      </TableCell>
                      <TableCell className="text-xs">{methodLabel(t.method)}</TableCell>
                      <TableCell className="text-xs">{t.reference ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === "POSTED" ? "success" : t.status === "REVERSED" ? "danger" : "muted"}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.receiptUrl ? (
                          <Link href={t.receiptUrl} target="_blank" className="inline-flex items-center gap-1 text-xs text-sgs-teal-700 hover:underline">
                            <FileText className="h-3.5 w-3.5" /> View
                          </Link>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
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
