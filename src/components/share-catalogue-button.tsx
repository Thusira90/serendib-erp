"use client";

import { ShareLinksMenu, type SharePath } from "./share-links-menu";

/**
 * "Share catalogue" — sends the public /catalogue root, optionally with
 * a prefilled filter query so the recipient lands on a scoped view
 * (e.g. only sapphires under LKR 500k).
 */
export function ShareCatalogueButton({
  size = "default",
  filterQuery,
  captionSuffix,
  contactEmail,
  contactPhone,
}: {
  size?: "default" | "sm" | "icon";
  /** e.g. "?type=Sapphire&maxPrice=500000" */
  filterQuery?: string | null;
  /** Appended to the default caption — e.g. "based on your enquiry ENQ-…" */
  captionSuffix?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}) {
  const q = (filterQuery ?? "").trim();
  const suffixed = q.startsWith("?") ? q : q ? `?${q}` : "";
  const paths: SharePath[] = [
    {
      key: "catalogue",
      label: q ? "Filtered catalogue view" : "Full catalogue",
      hint: q ? "Only shows stones matching this filter" : "Every stone currently available for sale",
      path: `/catalogue${suffixed}`,
    },
  ];
  const captionTail = captionSuffix ? ` ${captionSuffix}` : "";
  return (
    <ShareLinksMenu
      title="Share Serendib inventory"
      intro="Send the customer the full public catalogue, or a filtered link that lands them on the stones you have in mind."
      triggerLabel="Share catalogue"
      triggerVariant="outline"
      triggerSize={size}
      paths={paths}
      defaultCaption={`Hi — here's our current available gemstone inventory.${captionTail} Have a browse and let me know what catches your eye:`}
      contactEmail={contactEmail}
      contactPhone={contactPhone}
    />
  );
}
