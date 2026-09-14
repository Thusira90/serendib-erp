/**
 * Common international couriers used for high-value gem shipments.
 * Each entry supplies a template that substitutes {n} with the tracking number.
 * Unknown couriers fall back to a Google search of the tracking number so the
 * user can still get to their carrier's tracking page in one click.
 */
export const CARRIERS = [
  { code: "FEDEX",   name: "FedEx",       url: (n: string) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}` },
  { code: "DHL",     name: "DHL Express", url: (n: string) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}` },
  { code: "UPS",     name: "UPS",         url: (n: string) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}` },
  { code: "TNT",     name: "TNT",         url: (n: string) => `https://www.tnt.com/express/en_gc/site/tracking.html?searchType=CON&cons=${encodeURIComponent(n)}` },
  { code: "MALCA",   name: "Malca-Amit",  url: (n: string) => `https://www.malca-amit.com/track/?shipment=${encodeURIComponent(n)}` },
  { code: "BRINKS",  name: "Brink's",     url: (n: string) => `https://www.brinks.com/en/tracking?trackingNumber=${encodeURIComponent(n)}` },
  { code: "OTHER",   name: "Other / hand-delivery", url: (n: string) => `https://www.google.com/search?q=${encodeURIComponent(n + " tracking")}` },
] as const;

export type CarrierCode = (typeof CARRIERS)[number]["code"];

export function trackingUrl(courier: string | null, trackingNumber: string | null): string | null {
  if (!trackingNumber) return null;
  const match = CARRIERS.find((c) => c.code === courier || c.name === courier);
  return (match ?? CARRIERS[CARRIERS.length - 1]).url(trackingNumber);
}
