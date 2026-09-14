import { LoginForm } from "./login-form";
import { getCompanySettings } from "@/lib/company-settings";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const sp = await searchParams;
  const company = await getCompanySettings();
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sgs-gradient text-white">
        <div className="flex items-center gap-3">
          {/* Solid white chip so the real full-colour logo reads cleanly on the gradient */}
          <div className="h-12 w-12 rounded-md bg-white shadow-luxe grid place-items-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/serendib-logo.jpg" alt="Serendib Gemstones" className="h-10 w-10 object-contain" />
          </div>
          <div className="leading-tight">
            <div className="font-serif text-2xl">Serendib</div>
            <div className="text-[11px] uppercase tracking-[0.28em] opacity-80 -mt-0.5">Gemstones</div>
          </div>
        </div>
        <div className="max-w-md">
          <h1 className="font-serif text-4xl mb-4">Every stone has a story.</h1>
          <p className="text-white/85 leading-relaxed">
            From Ratnapura rough to certified finished gem — one system that
            knows where each stone came from, what it became, what it cost, and
            where it is now.
          </p>
        </div>
        <div className="text-xs opacity-70">© {company.legalName}</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <LoginForm callbackUrl={sp.callbackUrl} error={sp.error} />
      </div>
    </div>
  );
}
