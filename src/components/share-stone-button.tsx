"use client";

import { ShareLinksMenu, type SharePath } from "./share-links-menu";

/**
 * "Share this stone" — offers the customer-facing catalogue view and the
 * public verify certificate URL. Placed on gemstone detail + list rows.
 */
export function ShareStoneButton({
  code, label, price, currency, size = "sm", contactEmail, contactPhone,
}: {
  code: string;                          // SGS-G-YYYY-NNNNNN
  label: string;                         // "Blue Sapphire · 4.2 ct"
  price?: number | null;
  currency?: string | null;
  size?: "default" | "sm" | "icon";
  contactEmail?: string | null;
  contactPhone?: string | null;
}) {
  const paths: SharePath[] = [
    {
      key: "catalogue",
      label: "Catalogue view",
      hint: "Public marketing page with photos and asking price",
      path: `/catalogue/${encodeURIComponent(code)}`,
    },
    {
      key: "verify",
      label: "Verify certificate",
      hint: "Public provenance page — anyone with the link can view",
      path: `/verify/${encodeURIComponent(code)}`,
    },
  ];
  const pricePart = price != null && currency
    ? ` (asking ${new Intl.NumberFormat("en-LK", { style: "currency", currency, maximumFractionDigits: 0 }).format(price)})`
    : "";
  return (
    <ShareLinksMenu
      title={`Share ${code}`}
      intro="Send the customer either the marketing view (photos + price) or the certificate/provenance view."
      triggerLabel="Share"
      triggerSize={size}
      paths={paths}
      defaultCaption={`Hi — I thought you might like this ${label}${pricePart}. Full details and photos here:`}
      contactEmail={contactEmail}
      contactPhone={contactPhone}
    />
  );
}
