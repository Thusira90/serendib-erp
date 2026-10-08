import { Card, CardContent } from "@/components/ui/card";
import { renderQrSvg, publicVerifyUrl } from "@/lib/qr";
import { publicOrigin } from "@/lib/public-url";
import { QrPrintButton } from "./qr-print-button";
import { CopyLinkButton } from "./copy-link-button";

/**
 * QR card for the internal record view.
 * The QR points at the public /verify/<code> page for both finished and rough
 * stones: identity and media only, never price, cost or supplier.
 */
export async function QrCard({
  code, kind, label,
}: {
  code: string;
  kind: "gemstone" | "rough";
  label: string;
}) {
  // Full address, public for both kinds: scanning shows the stone without any price or cost.
  const url = publicVerifyUrl(code, await publicOrigin());
  const svg = await renderQrSvg(url, { size: 220 });
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">QR</div>
            <div className="text-sm font-medium">{label}</div>
            <div className="text-xs text-muted-foreground font-mono">{code}</div>
          </div>
          <QrPrintButton code={code} kind={kind} />
        </div>
        <div className="grid place-items-center">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
        <CopyLinkButton
          path={url}
          public
          label="Public verify link"
        />
      </CardContent>
    </Card>
  );
}
