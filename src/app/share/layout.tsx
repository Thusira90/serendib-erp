import Link from "next/link";
import { SgsLogo } from "@/components/brand/logo";
import { getCompanySettings } from "@/lib/company-settings";

export default async function ShareLayout({ children }: { children: React.ReactNode }) {
  const company = await getCompanySettings();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="max-w-[1200px] mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/catalogue" className="inline-flex items-center gap-3">
            <SgsLogo size={36} />
          </Link>
          <div className="text-right text-xs text-muted-foreground">
            {company.email && <div>{company.email}</div>}
            {company.phone && <div>{company.phone}</div>}
          </div>
        </div>
      </header>
      <main className="max-w-[1200px] mx-auto px-4 py-8">{children}</main>
      <footer className="border-t mt-16 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {company.legalName}
      </footer>
    </div>
  );
}
