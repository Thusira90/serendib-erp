import { NextResponse } from "next/server";
import { getExchangeRates } from "@/lib/exchange-rates";

// Route runs on the Node runtime (serverless fetch works fine).
// Revalidated hourly so the client's live-rate hint stays close to real.
export const revalidate = 3600;

export async function GET() {
  const rates = await getExchangeRates();
  return NextResponse.json(rates, {
    headers: {
      // Browsers may cache for 15 min; CDN for the full hour.
      "Cache-Control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
