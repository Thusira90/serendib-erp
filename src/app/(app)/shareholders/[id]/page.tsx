import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { IssueSharesButton } from "../issue-shares-button";
import { TransferSharesButton } from "../transfer-shares-button";
import { Users2, ChevronLeft, ExternalLink, FileText } from "lucide-react";

export default async function ShareholderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireCapability("shareholder:read");
  const canWrite = can(session.user.role, "shareholder:write");

  const [shareholder, shareClasses, allLots, allShareholders] = await Promise.all([
    prisma.shareholder.findUnique({
      where: { id },
      include: {
        director: true,
        lots: { include: { shareClass: true } },
        transactionsFrom: { orderBy: { transactionDate: "desc" }, include: { shareClass: true, transferee: true } },
        transactionsTo:   { orderBy: { transactionDate: "desc" }, include: { shareClass: true, transferor: true } },
        capitalTransactions: { orderBy: { transactionDate: "desc" } },
      },
    }),
    prisma.shareClass.findMany({ orderBy: { code: "asc" } }),
    prisma.shareLot.findMany(),
    prisma.shareholder.findMany({ select: { id: true, code: true, name: true, active: true } }),
  ]);
  if (!shareholder) notFound();

  const issuedByClass = new Map<string, number>();
  for (const l of allLots) issuedByClass.set(l.shareClassId, (issuedByClass.get(l.shareClassId) ?? 0) + Number(l.numberOfShares));

  const allTxns = [...shareholder.transactionsFrom, ...shareholder.transactionsTo]
    .sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime());

  const holders = allLots
    .filter((l) => Number(l.numberOfShares) > 0)
    .map((l) => {
      const s = allShareholders.find((x) => x.id === l.shareholderId)!;
      return { id: s.id, code: s.code, name: s.name, classId: l.shareClassId, numberOfShares: Number(l.numberOfShares) };
    });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/shareholders" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to shareholders
        </Link>
        <div className="flex items-end justify-between gap-4 mt-2">
          <div>
            <h1 className="font-serif text-3xl flex items-center gap-3">
              <Users2 className="h-7 w-7 text-sgs-teal-500" /> {shareholder.name}
            </h1>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <span className="font-mono">{shareholder.code}</span>
              <span>·</span>
              <Badge variant="muted">{shareholder.kind}</Badge>
              {shareholder.director && (
                <>
                  <span>·</span>
                  <Link href={`/directors/${shareholder.director.id}`} className="inline-flex items-center gap-1 text-sgs-teal-700 hover:underline">
                    Director {shareholder.director.code} <ExternalLink className="h-3 w-3" />
                  </Link>
                </>
              )}
              <span>·</span>
              <Badge variant={shareholder.active ? "success" : "muted"}>{shareholder.active ? "Active" : "Inactive"}</Badge>
            </div>
          </div>
          {canWrite && (
            <div className="flex gap-2">
              <IssueSharesButton
                shareClasses={shareClasses.map((c) => ({ id: c.id, code: c.code, name: c.name, faceValue: Number(c.faceValue), currency: c.currency }))}
                shareholders={allShareholders}
                presetShareholderId={shareholder.id}
              />
              <TransferSharesButton
                shareClasses={shareClasses.map((c) => ({ id: c.id, code: c.code, name: c.name, currency: c.currency }))}
                holders={holders}
                presetTransferorId={shareholder.id}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <KV label="Email" value={shareholder.email ?? "—"} />
            <KV label="Phone" value={shareholder.phone ?? "—"} />
            <KV label="ID / Reg. no." value={shareholder.nationalId ?? "—"} />
            <KV label="Address" value={shareholder.address ?? "—"} />
            {shareholder.notes && (
              <div className="pt-2 border-t">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</div>
                <div className="text-sm mt-1 whitespace-pre-wrap">{shareholder.notes}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Current holdings</CardTitle></CardHeader>
          <CardContent>
            {shareholder.lots.filter((l) => Number(l.numberOfShares) > 0).length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No current holdings.</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {shareholder.lots.filter((l) => Number(l.numberOfShares) > 0).map((l) => {
                  const totalOfClass = issuedByClass.get(l.shareClassId) ?? 0;
                  const pct = totalOfClass > 0 ? (Number(l.numberOfShares) / totalOfClass) * 100 : 0;
                  return (
                    <div key={l.id} className="rounded-lg border bg-secondary/40 px-4 py-3">
                      <div className="flex items-baseline justify-between">
                        <div className="font-mono text-sm">{l.shareClass.code}</div>
                        <div className="text-xs text-muted-foreground">{pct.toFixed(2)}% of class</div>
                      </div>
                      <div className="font-serif text-2xl num">{Number(l.numberOfShares).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Paid-up {formatCurrency(Number(l.paidUpAmount), l.shareClass.currency)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Share transaction history</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTxns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No transactions.</TableCell>
                </TableRow>
              )}
              {allTxns.map((t) => {
                const isFrom = "transferee" in t && t.transferorId === shareholder.id;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.code}</TableCell>
                    <TableCell className="text-xs">{formatDate(t.transactionDate)}</TableCell>
                    <TableCell><Badge variant="muted">{t.type.replace("SHARE_", "")}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{t.shareClass.code}</TableCell>
                    <TableCell className="text-xs">
                      {isFrom
                        ? <>→ {("transferee" in t && t.transferee ? t.transferee.name : "cancelled")}</>
                        : <>← {("transferor" in t && t.transferor ? t.transferor.name : "issue")}</>}
                    </TableCell>
                    <TableCell className={`text-right num ${isFrom ? "text-red-600" : "text-green-700"}`}>
                      {isFrom ? "−" : "+"}{Number(t.numberOfShares).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right num">{formatCurrency(Number(t.pricePerShare), t.currency)}</TableCell>
                    <TableCell className="text-xs">{t.reference ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {shareholder.capitalTransactions.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Shareholder-side capital (share capital in, dividends out)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shareholder.capitalTransactions.map((t) => (
                  <TableRow key={t.id} className={t.status === "REVERSED" ? "opacity-60" : ""}>
                    <TableCell className="font-mono text-xs">{t.code}</TableCell>
                    <TableCell className="text-xs">{formatDate(t.transactionDate)}</TableCell>
                    <TableCell><Badge variant="muted">{t.type}</Badge></TableCell>
                    <TableCell className="text-right num font-medium">{formatCurrency(Number(t.amount), t.currency)}</TableCell>
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
                ))}
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
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground pt-0.5">{label}</div>
      <div>{value}</div>
    </div>
  );
}
