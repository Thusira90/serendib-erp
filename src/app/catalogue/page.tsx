import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCarat, formatCurrency } from "@/lib/utils";
import { Gem } from "lucide-react";

export const metadata = { title: "Catalogue — Serendib Gemstones" };

type Filters = {
  type?: string; origin?: string; treatment?: string;
  min?: string; max?: string;
  minPrice?: string; maxPrice?: string;
};

export default async function CataloguePage({ searchParams }: { searchParams: Promise<Filters> }) {
  const sp = await searchParams;
  const filters = {
    type: sp.type?.trim() || null,
    origin: sp.origin?.trim() || null,
    treatment: sp.treatment?.trim() || null,
    minWeight: sp.min ? parseFloat(sp.min) : null,
    maxWeight: sp.max ? parseFloat(sp.max) : null,
    minPrice: sp.minPrice ? parseFloat(sp.minPrice) : null,
    maxPrice: sp.maxPrice ? parseFloat(sp.maxPrice) : null,
  };

  const gems = await prisma.gemstone.findMany({
    where: {
      status: "AVAILABLE",
      askingPrice: { not: null },
      ...(filters.type ? { gemType: filters.type } : {}),
      ...(filters.origin ? { origin: filters.origin } : {}),
      ...(filters.treatment ? { treatment: filters.treatment } : {}),
      ...(filters.minWeight != null || filters.maxWeight != null ? {
        weightCt: {
          ...(filters.minWeight != null ? { gte: filters.minWeight } : {}),
          ...(filters.maxWeight != null ? { lte: filters.maxWeight } : {}),
        },
      } : {}),
      ...(filters.minPrice != null || filters.maxPrice != null ? {
        askingPrice: {
          ...(filters.minPrice != null ? { gte: filters.minPrice } : {}),
          ...(filters.maxPrice != null ? { lte: filters.maxPrice } : {}),
          not: null,
        },
      } : {}),
    },
    include: {
      digitalAssets: {
        where: { isPrimary: true, kind: { in: ["FINISHED_PHOTO", "MACRO_PHOTO", "CATALOGUE_IMAGE"] } },
        take: 1,
      },
      cgiProjects: { include: { versions: { where: { isMaster: true }, take: 1 } } },
      certificates: { where: { status: "ISSUED" }, include: { laboratory: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const [types, origins, treatments] = await Promise.all([
    prisma.gemstone.groupBy({ by: ["gemType"], where: { status: "AVAILABLE" } }),
    prisma.gemstone.groupBy({ by: ["origin"], where: { status: "AVAILABLE" } }),
    prisma.gemstone.groupBy({ by: ["treatment"], where: { status: "AVAILABLE" } }),
  ]);

  return (
    <div className="space-y-8">
      <section className="text-center pb-4">
        <div className="text-[11px] uppercase tracking-[0.3em] text-sgs-purple-500">Available now</div>
        <h1 className="font-serif text-4xl mt-2">A curated selection of Ceylon &amp; Mogok gemstones</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
          Each stone below is available for sale. Prices are indicative; contact us to reserve or ask questions.
        </p>
      </section>

      <form action="/catalogue" className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white border rounded-lg p-4">
        <FilterSelect name="type" label="Gem type" current={sp.type} options={types.map((o) => o.gemType).filter(Boolean) as string[]} />
        <FilterSelect name="origin" label="Origin" current={sp.origin} options={origins.map((o) => o.origin).filter(Boolean) as string[]} />
        <FilterSelect name="treatment" label="Treatment" current={sp.treatment} options={treatments.map((o) => o.treatment).filter(Boolean) as string[]} />
        <FilterRange name="min" name2="max" label="Weight (ct)" v1={sp.min} v2={sp.max} />
        <FilterRange name="minPrice" name2="maxPrice" label="Price (USD)" v1={sp.minPrice} v2={sp.maxPrice} full />
        <div className="md:col-span-2 flex items-end justify-end gap-2">
          <Link href="/catalogue" className="text-xs border rounded-md px-3 py-1.5 hover:bg-secondary">Reset</Link>
          <button className="text-xs border rounded-md px-3 py-1.5 bg-sgs-teal-500 text-white hover:bg-sgs-teal-600">Filter</button>
        </div>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {gems.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-12">
            Nothing matches those filters right now. <Link href="/catalogue" className="text-sgs-teal-700 hover:underline">Reset</Link> to see everything available.
          </div>
        )}
        {gems.map((g) => {
          const cgi = g.cgiProjects.flatMap((p) => p.versions).find((v) => v.isMaster);
          const heroImg = cgi?.renderUrl ?? g.digitalAssets[0]?.url;
          const cert = g.certificates[0];
          return (
            <Link key={g.id} href={`/catalogue/${g.code}`}>
              <div className="bg-white border rounded-xl overflow-hidden shadow-luxe hover:shadow-luxe-lg transition-shadow">
                <div className="aspect-square bg-sgs-gradient relative">
                  {heroImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={heroImg} alt={g.code} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-white/70"><Gem className="h-14 w-14" /></div>
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-sgs-purple-500">{g.gemType}{g.variety ? ` · ${g.variety}` : ""}</div>
                      <div className="font-serif text-xl mt-0.5">{formatCarat(Number(g.weightCt))}</div>
                    </div>
                    {g.askingPrice != null && (
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground">Ask</div>
                        <div className="font-serif text-lg num">{formatCurrency(Number(g.askingPrice), g.currency)}</div>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[g.origin, g.treatment].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {cert && (
                    <div className="text-[10px] text-sgs-teal-700 border-t pt-2">
                      {cert.laboratory.name} certificate
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function FilterSelect({ name, label, current, options }: { name: string; label: string; current?: string; options: string[] }) {
  return (
    <label className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <select name={name} defaultValue={current ?? ""} className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm">
        <option value="">Any</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function FilterRange({ name, name2, label, v1, v2, full = false }: { name: string; name2: string; label: string; v1?: string; v2?: string; full?: boolean }) {
  return (
    <label className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex gap-2">
        <input name={name} inputMode="decimal" placeholder="min" defaultValue={v1} className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm" />
        <input name={name2} inputMode="decimal" placeholder="max" defaultValue={v2} className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm" />
      </div>
    </label>
  );
}
