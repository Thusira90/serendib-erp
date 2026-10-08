import { SgsLogo } from "@/components/brand/logo";

export const metadata = { title: "Link not available", robots: { index: false, follow: false } };

export default function PartnerNotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <div className="max-w-sm text-center space-y-4">
        <div className="flex justify-center"><SgsLogo size={36} /></div>
        <h1 className="font-serif text-2xl">This link is not available</h1>
        <p className="text-sm text-muted-foreground">
          It may have expired or been withdrawn. Please contact the person who shared it with you.
        </p>
      </div>
    </main>
  );
}
