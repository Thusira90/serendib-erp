import { Card, CardContent } from "@/components/ui/card";
import { renderQrSvg, publicVerifyUrl } from "@/lib/qr";
import Link from "next/link";
import { QrPrintButton } from "./qr-print-button";

/**
 * QR card for the internal record view.
 * For finished stones the QR points at the public /verify/<code> page.
 * For rough stones the QR points at the internal record (login gated).
 */
export async function QrCard({
  code, kind, label,
}: {
  code: string;
  kind: "gemstone" | "rough";
  label: string;
}) {
  const url = kind === "gemstone"
    ? publicVerifyUrl(code)
    : `/rough/${code}`;
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
        {kind === "gemstone" && (
          <div className="text-[10px] text-muted-foreground text-center">
            Public — scan opens{" "}
            <Link href={url} className="text-sgs-teal-700 hover:underline">/verify/{code}</Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
