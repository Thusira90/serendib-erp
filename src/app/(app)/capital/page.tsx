import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getCompanySettings } from "@/lib/company-settings";
import { RecordCapitalTxnButton } from "./record-capital-txn-button";
import { ReverseButton } from "./reverse-button";
import { CAPITAL_TXN_META, type CapitalTxnType } from "@/lib/enums";
import { Wallet, FileText, ExternalLink } from "lucide-react";

const methodLabel = (m: string) => m.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

/**
 * Capital ledger — the spec §20 view. Every director and every shareholder
 * gets a row summarising the money they've put in / taken out, in each
 * currency it was recorded in. Reversed entries are excluded from the
 * balance calc but stay visible in the transaction log below.
 *
 * IMPORTANT: totals are grouped BY CURRENCY. We don't do server-side FX
 * because live rates live client-side. If a director's dealings span
 * currencies, they show multiple rows in the "Outstanding balance" column.
 */
export default async function CapitalLedgerPage() {
  const session = await requireCapability("capital:read");
  const canWrite = can(session.user.role, "capital:write");

  const [directors, shareholders, allTxns, shareClasses, allLots, company] = await Promise.all([
    prisma.director.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { shareholder: true },
    }),
    prisma.shareholder.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { director: true, lots: true },
    }),
    prisma.capitalTransaction.findMany({
      orderBy: { transactionDate: "desc" },
      include: {
        director: { select: { id: true, code: true, name: true } },
        shareholder: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.shareClass.findMany(),
    prisma.shareLot.findMany(),
    getCompanySettings(),
  ]);

  const activeTxns = allTxns.filter((t) => t.status !== "REVERSED");

  // ── Cap-table % per shareholder & class ───────────────────────────────────
  const issuedByClass = new Map<string, number>();
  for (const l of allLots) issuedByClass.set(l.shareClassId, (issuedByClass.get(l.shareClassId) ?? 0) + Number(l.numberOfShares));

  // ── Per-party per-type per-currency rollup ────────────────────────────────
  type PartyKey = string;   // "d:<id>" or "s:<id>"
  const buckets = new Map<PartyKey, Map<CapitalTxnType, Map<string, number>>>();
  const bump = (key: PartyKey, type: CapitalTxnType, ccy: string, amount: number) => {
    let byType = buckets.get(key);
    if (!byType) { byType = new Map(); buckets.set(key, byType); }
    let byCcy = byType.get(type);
    if (!byCcy) { byCcy = new Map(); byType.set(type, byCcy); }
    byCcy.set(ccy, (byCcy.get(ccy) ?? 0) + amount);
  };
  for (const t of activeTxns) {
    const amt = Number(t.amount);
    if (t.directorId)   bump(`d:${t.directorId}`,   t.type as CapitalTxnType, t.currency, amt);
    if (t.shareholderId) bump(`s:${t.shareholderId}`, t.type as CapitalTxnType, t.currency, amt);
  }

  // The "party rows" for the ledger table below — one per director and one
  // per non-director shareholder (director-shareholders show only once).
  type Row = {
    key: PartyKey;
    partyKind: "director" | "shareholder";
    id: string;
    code: string;
    name: string;
    active: boolean;
    directorId?: string;
    shareholderId?: string;
    holdings?: { classCode: string; shares: number; pct: number }[];
  };
  const rows: Row[] = [];
  const seenShareholderIds = new Set<string>();
  for (const d of directors) {
    const shareholder = d.shareholder;
    const holdings = shareholder
      ? shareholders.find((s) => s.id === shareholder.id)?.lots
          .filter((l) => Number(l.numberOfShares) > 0)
          .map((l) => {
            const cls = shareClasses.find((c) => c.id === l.shareClassId);
            const total = issuedByClass.get(l.shareClassId) ?? 0;
            return {
              classCode: cls?.code ?? "?",
              shares: Number(l.numberOfShares),
              pct: total > 0 ? (Number(l.numberOfShares) / total) * 100 : 0,
            };
          })
      : [];
    rows.push({
      key: `d:${d.id}`,
      partyKind: "director",
      id: d.id,
      code: d.code,
      name: d.name,
      active: d.active,
      directorId: d.id,
      shareholderId: shareholder?.id,
      holdings,
    });
    if (shareholder) seenShareholderIds.add(shareholder.id);
  }
  for (const s of shareholders) {
    if (seenShareholderIds.has(s.id)) continue;
    const holdings = s.lots.filter((l) => Number(l.numberOfShares) > 0).map((l) => {
      const cls = shareClasses.find((c) => c.id === l.shareClassId);
      const total = issuedByClass.get(l.shareClassId) ?? 0;
      return {
        classCode: cls?.code ?? "?",
        shares: Number(l.numberOfShares),
        pct: total > 0 ? (Number(l.numberOfShares) / total) * 100 : 0,
      };
    });
    rows.push({
      key: `s:${s.id}`,
      partyKind: "shareholder",
      id: s.id,
      code: s.code,
      name: s.name,
      active: s.active,
      shareholderId: s.id,
      holdings,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3">
            <Wallet className="h-7 w-7 text-sgs-purple-500" /> Capital ledger
          </h1>
          <p className="text-sm text-muted-foreground">
            Per-party rollup of share capital, director loans, advances, expenses paid on behalf, withdrawals and dividends —
            in the currency each entry was posted in.
          </p>
        </div>
        {canWrite && (
          <RecordCapitalTxnButton
            directors={directors.map((d) => ({ id: d.id, code: d.code, name: d.name, active: d.active }))}
            shareholders={shareholders.map((s) => ({ id: s.id, code: s.code, name: s.name, active: s.active }))}
            defaultCurrency={company.defaultCurrency}
          />
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Ledger</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead>Holdings / %</TableHead>
                <TableHead className="text-right">Share capital in</TableHead>
                <TableHead className="text-right">Director loan (net)</TableHead>
                <TableHead className="text-right">Advances (net)</TableHead>
                <TableHead className="text-right">Expenses paid</TableHead>
                <TableHead className="text-right">Withdrawals</TableHead>
                <TableHead className="text-right">Dividends</TableHead>
                <TableHead className="text-right">Outstanding balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">
                    No directors or shareholders on file yet. Add them from{" "}
                    <Link href="/directors" className="text-sgs-teal-700 hover:underline">Directors</Link> and{" "}
                    <Link href="/shareholders" className="text-sgs-teal-700 hover:underline">Shareholders</Link>.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                // A director who is also a shareholder gets rolled up from
                // BOTH buckets — the share-capital / dividend entries live
                // under the shareholder key, the loan / advance / expenses /
                // withdrawal entries live under the director key.
                const keys: PartyKey[] = [r.key];
                if (r.partyKind === "director" && r.shareholderId) keys.push(`s:${r.shareholderId}`);
                if (r.partyKind === "shareholder" && r.directorId) keys.push(`d:${r.directorId}`);
                const pick = (t: CapitalTxnType) => {
                  const out = new Map<string, number>();
                  for (const k of keys) {
                    const perCcy = buckets.get(k)?.get(t);
                    if (!perCcy) continue;
                    for (const [ccy, amt] of perCcy) out.set(ccy, (out.get(ccy) ?? 0) + amt);
                  }
                  return out;
                };
                const shareCapital = pick("SHARE_CAPITAL");
                const loanIn       = pick("DIRECTOR_LOAN");
                const loanRepay    = pick("LOAN_REPAY");
                const advanceIn    = pick("ADVANCE");
                const advanceRepay = pick("ADVANCE_REPAY");
                const expensesPaid = pick("EXPENSE_PAID_ON_BEHALF");
                const withdrawals  = pick("WITHDRAWAL");
                const dividends    = pick("DIVIDEND");

                // Outstanding balance = money company owes the party (§20).
                const balances = new Map<string, number>();
                const addToBalance = (m: Map<string, number>, sign: 1 | -1) => {
                  for (const [ccy, amt] of m) balances.set(ccy, (balances.get(ccy) ?? 0) + sign * amt);
                };
                addToBalance(loanIn, 1);
                addToBalance(loanRepay, -1);
                addToBalance(advanceIn, 1);
                addToBalance(advanceRepay, -1);
                addToBalance(expensesPaid, 1);
                addToBalance(withdrawals, -1);

                return (
                  <TableRow key={r.key}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={r.partyKind === "director" ? `/directors/${r.id}` : `/shareholders/${r.id}`}
                            className="text-sgs-teal-700 hover:underline font-medium"
                          >
                            {r.name}
                          </Link>
                          {!r.active && <Badge variant="muted">Inactive</Badge>}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="font-mono">{r.code}</span>
                          <span>·</span>
                          <span>{r.partyKind}</span>
                          {r.directorId && r.shareholderId && (
                            <Link
                              href={r.partyKind === "director" ? `/shareholders/${r.shareholderId}` : `/directors/${r.directorId}`}
                              className="inline-flex items-center gap-0.5 text-sgs-teal-700 hover:underline"
                            >
                              also {r.partyKind === "director" ? "shareholder" : "director"} <ExternalLink className="h-2.5 w-2.5" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.holdings && r.holdings.length > 0
                        ? r.holdings.map((h) => (
                          <div key={h.classCode}>
                            {h.shares.toLocaleString()} {h.classCode} · {h.pct.toFixed(2)}%
                          </div>
                        ))
                        : "—"}
                    </TableCell>
                    <MoneyCell perCcy={shareCapital} />
                    <MoneyCell perCcy={netMap(loanIn, loanRepay)} />
                    <MoneyCell perCcy={netMap(advanceIn, advanceRepay)} />
                    <MoneyCell perCcy={expensesPaid} />
                    <MoneyCell perCcy={withdrawals} />
                    <MoneyCell perCcy={dividends} />
                    <MoneyCell perCcy={balances} accent />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All capital transactions</CardTitle>
          <p className="text-xs text-muted-foreground">
            Append-only ledger. Posted entries are never edited — use the reversal button to correct one.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Party</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Receipt</TableHead>
                {canWrite && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTxns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canWrite ? 10 : 9} className="text-center text-sm text-muted-foreground py-10">
                    No capital transactions posted yet.
                  </TableCell>
                </TableRow>
              )}
              {allTxns.map((t) => {
                const meta = CAPITAL_TXN_META[t.type as CapitalTxnType];
                const party = t.director ?? t.shareholder;
                const partyHref = t.director
                  ? `/directors/${t.director.id}`
                  : t.shareholder ? `/shareholders/${t.shareholder.id}` : null;
                const canReverse = canWrite && t.status === "POSTED" && t.type !== "SHARE_CAPITAL" && Number(t.amount) > 0;
                return (
                  <TableRow key={t.id} className={t.status === "REVERSED" ? "opacity-60" : ""}>
                    <TableCell className="font-mono text-xs">
                      {t.code}
                      {t.reversalOfId && <div className="text-[9px] text-muted-foreground">reverses ↑</div>}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(t.transactionDate)}</TableCell>
                    <TableCell className="text-xs"><Badge variant="muted">{meta?.label ?? t.type}</Badge></TableCell>
                    <TableCell className="text-xs">
                      {party && partyHref
                        ? <Link href={partyHref} className="text-sgs-teal-700 hover:underline">{party.name}</Link>
                        : "—"}
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
                    {canWrite && (
                      <TableCell>
                        {canReverse ? <ReverseButton id={t.id} code={t.code} /> : null}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function netMap(pos: Map<string, number>, neg: Map<string, number>) {
  const out = new Map(pos);
  for (const [ccy, amt] of neg) out.set(ccy, (out.get(ccy) ?? 0) - amt);
  for (const [ccy, amt] of out) if (amt === 0) out.delete(ccy);
  return out;
}

function MoneyCell({ perCcy, accent = false }: { perCcy: Map<string, number>; accent?: boolean }) {
  const entries = Array.from(perCcy.entries()).filter(([, v]) => v !== 0);
  return (
    <TableCell className="text-right text-xs">
      {entries.length === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : entries.map(([ccy, amt]) => (
        <div
          key={ccy}
          className={`num ${accent ? "font-semibold" : ""} ${amt < 0 ? "text-red-600" : accent ? "text-sgs-purple-600" : ""}`}
        >
          {formatCurrency(amt, ccy)}
        </div>
      ))}
    </TableCell>
  );
}
