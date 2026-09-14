import Link from "next/link";
import { SgsMark } from "@/components/brand/logo";
import { getCompanySettings } from "@/lib/company-settings";

export default async function CatalogueLayout({ children }: { children: React.ReactNode }) {
  const company = await getCompanySettings();
  return (
    <div className="min-h-screen bg-sgs-bone">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/catalogue" className="flex items-center gap-3">
            <SgsMark size={32} />
            <div className="leading-tight">
              <div className="font-serif text-lg tracking-tight text-sgs-teal-700">Serendib</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-sgs-purple-500 -mt-0.5">Gemstones</div>
            </div>
          </Link>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Catalogue</div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
      <footer className="max-w-6xl mx-auto px-6 py-8 text-center text-xs text-muted-foreground">
        {company.legalName} · {[company.city, company.country].filter(Boolean).join(", ")}
        {company.website && <> · {company.website}</>}
      </footer>
    </div>
  );
}
