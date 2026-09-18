import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getCompanySettings } from "@/lib/company-settings";
import { NewDirectorButton } from "./new-director-button";
import { RecordContributionButton } from "./record-contribution-button";
import { Crown, Users } from "lucide-react";

/**
 * Directors + cap table. Because contributions can be in different
 * currencies, we show one row per (director × currency) subtotal in the
 * "recent contributions" column and a top-level breakdown of totals per
 * currency. Multi-currency rollups need live rates, which live client-side
 * in the useExchangeRates hook; we don't attempt server-side conversion.
 */
export default async function DirectorsPage() {
  const session = await requireCapability("director:read");
  const canWrite = can(session.user.role, "director:write");
  const [directors, contribs, company] = await Promise.all([
    prisma.director.findMany({
      orderBy: [{ active: "desc" }, { sharePct: "desc" }, { name: "asc" }],
    }),
    prisma.capitalContribution.findMany({
      orderBy: { contributedAt: "desc" },
      take: 500,
    }),
    getCompanySettings(),
  ]);

  const totalsByDirector = new Map<string, Map<string, number>>();
  const lastAt = new Map<string, Date>();
  const perCurrency = new Map<string, number>();

  for (const c of contribs) {
    const amount = Number(c.amount);
    const dm = totalsByDirector.get(c.directorId) ?? new Map<string, number>();
    dm.set(c.currency, (dm.get(c.currency) ?? 0) + amount);
    totalsByDirector.set(c.directorId, dm);

    perCurrency.set(c.currency, (perCurrency.get(c.currency) ?? 0) + amount);

    const prev = lastAt.get(c.directorId);
    if (!prev || c.contributedAt > prev) lastAt.set(c.directorId, c.contributedAt);
  }

  const totalSharePct = directors
    .filter((d) => d.active)
    .reduce((sum, d) => sum + Number(d.sharePct), 0);

  const totalContribsCount = contribs.length;
  const currencyBadges = Array.from(perCurrency.entries())
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3">
            <Crown className="h-7 w-7 text-sgs-purple-500" /> Directors &amp; capital
          </h1>
          <p className="text-sm text-muted-foreground">
            Cap table, share percentages, and every capital injection recorded against a director.
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <NewDirectorButton />
            <RecordContributionButton
              directors={directors.map((d) => ({ id: d.id, name: d.name, code: d.code, active: d.active }))}
              defaultCurrency={company.defaultCurrency}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Active directors" value={String(directors.filter((d) => d.active).length)} />
        <Stat
          label="Cap table"
          value={`${totalSharePct.toFixed(2)}%`}
          hint={
            totalSharePct === 100
              ? "Fully allocated"
              : totalSharePct < 100
                ? `${(100 - totalSharePct).toFixed(2)}% unallocated`
                : `${(totalSharePct - 100).toFixed(2)}% over — review shares`
          }
          alert={totalSharePct > 100}
        />
        <Stat label="Contributions recorded" value={String(totalContribsCount)} />
        <Stat label="Currencies used" value={currencyBadges.length === 0 ? "—" : String(currencyBadges.length)} />
      </div>

      {currencyBadges.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Total capital contributed</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {currencyBadges.map(([ccy, amount]) => (
                <div key={ccy} className="rounded-lg border bg-secondary/40 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{ccy}</div>
                  <div className="font-serif text-2xl num">{formatCurrency(amount, ccy)}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Totals shown in the original contribution currency. Open a director for their per-currency breakdown.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Director</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Share %</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Contributions</TableHead>
                <TableHead>Last contribution</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {directors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                    <Users className="h-6 w-6 mx-auto mb-2 opacity-40" />
                    No directors yet. {canWrite && "Add one with the button above."}
                  </TableCell>
                </TableRow>
              )}
              {directors.map((d) => {
                const totals = totalsByDirector.get(d.id);
                const last = lastAt.get(d.id);
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.code}</TableCell>
                    <TableCell>
                      <Link href={`/directors/${d.id}`} className="text-sgs-teal-700 hover:underline font-medium">
                        {d.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{d.role}</TableCell>
                    <TableCell className="text-right num">
                      {Number(d.sharePct).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.email && <div>{d.email}</div>}
                      {d.phone && <div className="text-muted-foreground">{d.phone}</div>}
                      {!d.email && !d.phone && "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {totals && totals.size > 0
                        ? Array.from(totals.entries()).map(([ccy, amt]) => (
                          <div key={ccy} className="num">{formatCurrency(amt, ccy)}</div>
                        ))
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{last ? formatDate(last) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={d.active ? "success" : "muted"}>
                        {d.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
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

function Stat({ label, value, hint, alert = false }: { label: string; value: string; hint?: string; alert?: boolean }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-serif text-2xl num mt-1 ${alert ? "text-red-600" : ""}`}>{value}</div>
      {hint && <div className={`text-[10px] mt-1 ${alert ? "text-red-600" : "text-muted-foreground"}`}>{hint}</div>}
    </CardContent></Card>
  );
}
