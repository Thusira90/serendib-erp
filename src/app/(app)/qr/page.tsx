import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getQrPolicy } from "@/lib/qr-policy";
import { QR_KINDS } from "@/lib/qr-fields";
import { QrSettingsForm } from "./qr-settings-form";

export const dynamic = "force-dynamic";

export default async function QrSettingsPage() {
  const session = await requireCapability("settings:read");
  const canWrite = can(session.user, "settings:write");

  const [gemPolicy, roughPolicy, sampleGem, sampleRough] = await Promise.all([
    getQrPolicy("GEMSTONE"),
    getQrPolicy("ROUGH"),
    prisma.gemstone.findFirst({ orderBy: { createdAt: "desc" }, select: { code: true } }),
    prisma.roughStone.findFirst({ orderBy: { createdAt: "desc" }, select: { code: true } }),
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">QR codes</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Choose what a person sees when they scan a stone&apos;s QR code. Use it to limit what visitors learn at an
          exhibition, or what a buyer sees from a label on a box. The choice applies to every stone of that kind, and takes
          effect on the public page straight away. Labels already printed keep working: they link to the same page.
        </p>
      </div>
      {QR_KINDS.map(({ kind, title, blurb }) => (
        <QrSettingsForm
          key={kind}
          kind={kind}
          title={title}
          blurb={blurb}
          initial={kind === "ROUGH" ? roughPolicy : gemPolicy}
          sampleCode={(kind === "ROUGH" ? sampleRough : sampleGem)?.code ?? null}
          canWrite={canWrite}
        />
      ))}
    </div>
  );
}
