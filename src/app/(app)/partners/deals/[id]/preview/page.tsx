import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import type { PartnerPortalDto } from "@/lib/partner-dto";
import { PartnerViewError, buildPartnerPortalDto, type AdminPreview } from "@/lib/partner-view";
import { PartnerPortalView } from "@/components/partner-portal/portal-view";
import { PreviewFrame } from "./preview-frame";

export const dynamic = "force-dynamic";

export default async function PartnerPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("partner:read");
  const { id } = await params;

  const deal = await prisma.partnerDeal.findUnique({
    where: { id },
    select: { id: true, code: true, title: true, status: true, partner: { select: { name: true } } },
  });
  if (!deal) notFound();

  // The preview viewer carries no access id, so the log and counter code refuses it: nothing is recorded.
  const viewer: AdminPreview = { kind: "ADMIN_PREVIEW", dealId: deal.id };
  let dto: PartnerPortalDto | null = null;
  let failure: string | null = null;
  try {
    dto = await buildPartnerPortalDto({ dealId: deal.id, viewer });
  } catch (e) {
    console.error("partner preview failed:", e instanceof Error ? e.name : "unknown");
    failure = e instanceof PartnerViewError ? e.message : "Unexpected error; see the server log.";
  }

  return (
    <div className="space-y-4">
      <Link href={`/partners/deals/${deal.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to {deal.code}
      </Link>

      {dto ? (
        <PreviewFrame
          summary={
            <>
              <span className="font-mono">{deal.code}</span> as seen by {deal.partner.name} ({deal.status.toLowerCase()}). Document links open through the
              admin viewer and are not logged.
            </>
          }
        >
          <PartnerPortalView dto={dto} mode="preview" docBase={`/partners/deals/${deal.id}/preview/doc`} />
        </PreviewFrame>
      ) : (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">The preview could not be built.</p>
            <p className="text-xs">
              The partner page would show &quot;unavailable&quot; for the same reason. Detail for admins: {failure}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
