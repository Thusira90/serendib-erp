import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getCompanySettings } from "@/lib/company-settings";
import { NewShareholderButton } from "./new-shareholder-button";
import { NewShareClassButton } from "./new-share-class-button";
import { IssueSharesButton } from "./issue-shares-button";
import { TransferSharesButton } from "./transfer-shares-button";
import { Users2, Layers, ChevronsRight, FileText, ExternalLink } from "lucide-react";

/**
 * Share register + share transactions history. Ownership percentages are
 * computed here from the current ShareLot totals; nothing is stored
 * pre-computed anywhere (§17 of the spec: "do not simply overwrite
 * ownership percentages").
 */
export default async function ShareholdersPage() {
  const session = await requireCapability("shareholder:read");
  const canWrite = can(session.user.role, "shareholder:write");

  const [shareholders, shareClasses, allLots, txns, directors, company] = await Promise.all([
    prisma.shareholder.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { director: true, lots: true },
    }),
    prisma.shareClass.findMany({ orderBy: { code: "asc" } }),
    prisma.shareLot.findMany({ include: { shareClass: true, shareholder: true } }),
    prisma.shareTransaction.findMany({
      orderBy: { transactionDate: "desc" },
      take: 50,
      include: { shareClass: true, transferor: true, transferee: true },
    }),
    prisma.director.findMany({
      orderBy: { name: "asc" },
      include: { shareholder: { select: { id: true } } },
    }),
    getCompanySettings(),
  ]);

  // Totals issued per class = sum of lot balances
  const issuedByClass = new Map<string, number>();
  for (const l of allLots) {
    issuedByClass.set(l.shareClassId, (issuedByClass.get(l.shareClassId) ?? 0) + Number(l.numberOfShares));
  }

  const directorOptions = directors.map((d) => ({
    id: d.id, name: d.name, code: d.code, alreadyLinked: !!d.shareholder,
  }));

  const shareholdersForIssue = shareholders.map((s) => ({
    id: s.id, code: s.code, name: s.name, active: s.active,
  }));

  const holders = allLots
    .filter((l) => Number(l.numberOfShares) > 0)
    .map((l) => ({
      id: l.shareholderId, code: l.shareholder.code, name: l.shareholder.name,
      classId: l.shareClassId, numberOfShares: Number(l.numberOfShares),
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3">
            <Users2 className="h-7 w-7 text-sgs-teal-500" /> Shareholders &amp; share register
          </h1>
          <p className="text-sm text-muted-foreground">
            Every current holding plus the full append-only history of issues, transfers and cancellations.
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <NewShareClassButton defaultCurrency={company.defaultCurrency} />
            <NewShareholderButton directors={directorOptions} />
            <IssueSharesButton shareClasses={shareClasses.map((c) => ({
              id: c.id, code: c.code, name: c.name, faceValue: Number(c.faceValue), currency: c.currency,
            }))} shareholders={shareholdersForIssue} />
            <TransferSharesButton
              shareClasses={shareClasses.map((c) => ({ id: c.id, code: c.code, name: c.name, currency: c.currency }))}
              holders={holders}
            />
          </div>
        )}
      </div>

      {shareClasses.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-4 w-4" /> Share classes</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {shareClasses.map((c) => (
                <div key={c.id} className="rounded-lg border bg-secondary/30 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-mono text-sm">{c.code}</div>
                    <div className="text-xs text-muted-foreground">face {formatCurrency(Number(c.faceValue), c.currency)}</div>
                  </div>
                  <div className="text-sm mt-0.5">{c.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2">
                    Issued: {(issuedByClass.get(c.id) ?? 0).toLocaleString()} shares
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Share register</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Shareholder</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Also a director</TableHead>
                <TableHead>Holdings</TableHead>
                <TableHead>Ownership</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shareholders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                    No shareholders on the register yet. {canWrite && "Add one with the button above."}
                  </TableCell>
                </TableRow>
              )}
              {shareholders.map((s) => {
                const lots = s.lots.filter((l) => Number(l.numberOfShares) > 0);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell>
                      <Link href={`/shareholders/${s.id}`} className="text-sgs-teal-700 hover:underline font-medium">
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell><Badge variant="muted">{s.kind}</Badge></TableCell>
                    <TableCell className="text-xs">
                      {s.director ? (
                        <Link href={`/directors/${s.director.id}`} className="inline-flex items-center gap-1 text-sgs-teal-700 hover:underline">
                          {s.director.code} <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {lots.length === 0 ? "—" : lots.map((l) => {
                        const cls = shareClasses.find((c) => c.id === l.shareClassId);
                        return (
                          <div key={l.id} className="num">
                            {Number(l.numberOfShares).toLocaleString()} <span className="text-muted-foreground">{cls?.code ?? "?"}</span>
                          </div>
                        );
                      })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {lots.length === 0 ? "—" : lots.map((l) => {
                        const totalOfClass = issuedByClass.get(l.shareClassId) ?? 0;
                        const pct = totalOfClass > 0 ? (Number(l.numberOfShares) / totalOfClass) * 100 : 0;
                        const cls = shareClasses.find((c) => c.id === l.shareClassId);
                        return (
                          <div key={l.id} className="num">
                            {pct.toFixed(2)}% <span className="text-muted-foreground">{cls?.code ?? ""}</span>
                          </div>
                        );
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.active ? "success" : "muted"}>{s.active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ChevronsRight className="h-4 w-4" /> Recent share transactions</CardTitle>
          <p className="text-xs text-muted-foreground">Append-only. Reversals happen through a matching cancel or transfer entry, not by editing history.</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Document</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    No share transactions recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {txns.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.code}</TableCell>
                  <TableCell className="text-xs">{formatDate(t.transactionDate)}</TableCell>
                  <TableCell><Badge variant="muted">{t.type.replace("SHARE_", "")}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{t.shareClass.code}</TableCell>
                  <TableCell className="text-xs">
                    {t.transferor?.name ?? "issue"} <span className="text-muted-foreground">→</span> {t.transferee?.name ?? "cancelled"}
                  </TableCell>
                  <TableCell className="text-right num">{Number(t.numberOfShares).toLocaleString()}</TableCell>
                  <TableCell className="text-right num">{formatCurrency(Number(t.pricePerShare), t.currency)}</TableCell>
                  <TableCell className="text-xs">{t.reference ?? "—"}</TableCell>
                  <TableCell>
                    {t.documentUrl ? (
                      <Link href={t.documentUrl} target="_blank" className="inline-flex items-center gap-1 text-xs text-sgs-teal-700 hover:underline">
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
    </div>
  );
}
