import Link from "next/link";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency } from "@/lib/utils";
import { parseQuery, toGemstoneWhere } from "@/lib/nlq";
import { Sparkles } from "lucide-react";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  if (!q) return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Search</h1>
      <p className="text-sm text-muted-foreground">
        Enter a query in the top bar. IDs (SGS-G-…, SGS-R-…, CERT-…, INV-…),
        supplier/customer/parcel names, or natural language like{" "}
        <span className="italic">"untreated Ceylon sapphires above 3ct under $20k"</span>.
      </p>
    </div>
  );

  const parsed = parseQuery(q);
  const like = { contains: q };
  const semanticWhere = toGemstoneWhere(parsed);
  const semanticActive = parsed.understood;

  const [rough, gemsSemantic, gemsLike, suppliers, parcels, customers] = await Promise.all([
    prisma.roughStone.findMany({
      where: { OR: [{ code: like }, { gemType: like }, { variety: like }, { origin: like }] },
      take: 20,
    }),
    semanticActive
      ? prisma.gemstone.findMany({ where: { AND: [{ status: { in: ["AVAILABLE", "IN_PROGRESS", "RESERVED"] } }, semanticWhere] }, take: 30 })
      : Promise.resolve([]),
    prisma.gemstone.findMany({
      where: { OR: [{ code: like }, { gemType: like }, { variety: like }, { origin: like }, { colorDescription: like }] },
      take: 20,
    }),
    prisma.supplier.findMany({ where: { OR: [{ name: like }, { code: like }] }, take: 10 }),
    prisma.parcel.findMany({ where: { code: like }, take: 10 }),
    prisma.customer.findMany({
      where: { OR: [{ displayName: like }, { companyName: like }, { code: like }, { email: like }] },
      take: 10,
    }),
  ]);

  // Merge semantic and literal gem hits, preferring semantic first, dedup by id.
  const gemHits = new Map<string, (typeof gemsLike)[number]>();
  for (const g of gemsSemantic) gemHits.set(g.id, g);
  for (const g of gemsLike) if (!gemHits.has(g.id)) gemHits.set(g.id, g);
  const gems = Array.from(gemHits.values());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Search</h1>
        <p className="text-sm text-muted-foreground">Results for <span className="font-mono">{q}</span></p>
      </div>

      {semanticActive && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-sgs-purple-500" />
              Interpreted as an inventory query
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs">
            {parsed.gemTypes.map((v) => <Badge key={"t"+v} variant="teal">type: {v}</Badge>)}
            {parsed.varieties.map((v) => <Badge key={"v"+v} variant="teal">variety: {v}</Badge>)}
            {parsed.origins.map((v) => <Badge key={"o"+v} variant="teal">origin: {v}</Badge>)}
            {parsed.colors.map((v) => <Badge key={"c"+v} variant="teal">colour: {v}</Badge>)}
            {parsed.shapes.map((v) => <Badge key={"s"+v} variant="teal">shape: {v}</Badge>)}
            {parsed.treatments.map((v) => <Badge key={"tr"+v} variant="teal">treatment: {v}</Badge>)}
            {parsed.minWeightCt != null && <Badge variant="purple">≥ {parsed.minWeightCt.toFixed(2)} ct</Badge>}
            {parsed.maxWeightCt != null && <Badge variant="purple">≤ {parsed.maxWeightCt.toFixed(2)} ct</Badge>}
            {parsed.minPrice != null && <Badge variant="purple">≥ {formatCurrency(parsed.minPrice)}</Badge>}
            {parsed.maxPrice != null && <Badge variant="purple">≤ {formatCurrency(parsed.maxPrice)}</Badge>}
          </CardContent>
        </Card>
      )}

      <Section title={`Gemstones (${gems.length})`} empty={gems.length === 0}>
        {gems.map((g) => (
          <Link key={g.id} href={`/gemstones/${g.id}`} className="flex items-center justify-between p-3 rounded border bg-card hover:border-sgs-purple-500">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="purple">Gem</Badge>
              <span className="font-mono text-xs">{g.code}</span>
              <span>{g.gemType}{g.variety ? ` · ${g.variety}` : ""}</span>
              {g.origin && <span className="text-muted-foreground text-xs">· {g.origin}</span>}
              {g.treatment && <span className="text-muted-foreground text-xs">· {g.treatment}</span>}
            </div>
            <div className="text-xs text-muted-foreground">{formatCarat(Number(g.weightCt))} · {g.askingPrice ? formatCurrency(Number(g.askingPrice), g.currency) : "—"}</div>
          </Link>
        ))}
      </Section>
      <Section title={`Rough stones (${rough.length})`} empty={rough.length === 0}>
        {rough.map((r) => (
          <Link key={r.id} href={`/rough/${r.id}`} className="flex items-center justify-between p-3 rounded border bg-card hover:border-sgs-teal-500">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="teal">Rough</Badge>
              <span className="font-mono text-xs">{r.code}</span>
              <span>{r.gemType}{r.variety ? ` · ${r.variety}` : ""}</span>
            </div>
            <div className="text-xs text-muted-foreground">{formatCarat(Number(r.weightCt))} · {formatCurrency(Number(r.purchasePrice), r.currency)}</div>
          </Link>
        ))}
      </Section>
      <Section title={`Customers (${customers.length})`} empty={customers.length === 0}>
        {customers.map((c) => (
          <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center justify-between p-3 rounded border bg-card hover:border-sgs-teal-500">
            <div className="text-sm">
              <span className="font-mono text-xs mr-2">{c.code}</span>
              <span className="font-medium">{c.displayName}</span>
              {c.companyName && <span className="text-muted-foreground"> · {c.companyName}</span>}
            </div>
            <div className="text-xs text-muted-foreground">{[c.city, c.country].filter(Boolean).join(", ")}</div>
          </Link>
        ))}
      </Section>
      <Section title={`Suppliers (${suppliers.length})`} empty={suppliers.length === 0}>
        {suppliers.map((s) => (
          <div key={s.id} className="p-3 rounded border bg-card text-sm">
            <span className="font-mono text-xs mr-2">{s.code}</span>{s.name}
          </div>
        ))}
      </Section>
      <Section title={`Parcels (${parcels.length})`} empty={parcels.length === 0}>
        {parcels.map((p) => (
          <div key={p.id} className="p-3 rounded border bg-card text-sm font-mono">{p.code}</div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {empty ? <div className="text-sm text-muted-foreground">Nothing matched.</div> : children}
      </CardContent>
    </Card>
  );
}
