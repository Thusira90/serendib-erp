import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Serendib Gemstones ERP",
  description: "Rough-to-finished gemstone lifecycle management",
};

// Try to shave the first-image TTFB by letting the browser warm up the TLS
// connection to R2 while HTML is still streaming. Falls back silently if the
// env isn't set (local dev writes to public/uploads instead).
const r2Origin = (() => {
  try { return process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).origin : null; }
  catch { return null; }
})();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {r2Origin && <link rel="preconnect" href={r2Origin} crossOrigin="" />}
        {r2Origin && <link rel="dns-prefetch" href={r2Origin} />}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Cormorant+Garamond:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
