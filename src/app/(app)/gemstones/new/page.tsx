import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompanySettings } from "@/lib/company-settings";
import { GemstoneIntakeForm } from "./gemstone-intake-form";

export default async function NewGemstonePage() {
  await requireCapability("gemstone:write");
  const [suppliers, locations, company] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.inventoryLocation.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    getCompanySettings(),
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Register finished gemstone</h1>
        <p className="text-sm text-muted-foreground">
          Use this for already-cut stones acquired from a dealer, auction, or private sale.
          A new permanent Gem ID (<span className="font-mono">SGS-G-YYYY-######</span>) is minted
          and the purchase price is recorded as its acquisition cost.
          Stones cut in-house should come through <span className="font-medium">Rough → Start cutting → Complete job</span> instead,
          which preserves lineage automatically.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>Gemstone details</CardTitle></CardHeader>
        <CardContent>
          <GemstoneIntakeForm
            suppliers={suppliers}
            locations={locations}
            defaultCurrency={company.defaultCurrency}
          />
        </CardContent>
      </Card>
    </div>
  );
}
