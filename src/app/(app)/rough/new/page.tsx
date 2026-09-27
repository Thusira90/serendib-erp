import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompanySettings } from "@/lib/company-settings";
import { getFieldVocabulary } from "@/lib/field-vocab";
import { RoughForm } from "../rough-form";

export default async function NewRoughPage() {
  await requireCapability("rough:write");
  const [suppliers, parcels, locations, company, vocab] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.parcel.findMany({ orderBy: { purchaseDate: "desc" }, include: { supplier: true } }),
    prisma.inventoryLocation.findMany({ orderBy: { code: "asc" } }),
    getCompanySettings(),
    getFieldVocabulary([
      { model: "roughStone", field: "gemType" },
      { model: "roughStone", field: "variety" },
      { model: "roughStone", field: "species" },
      { model: "roughStone", field: "origin" },
      { model: "roughStone", field: "mineSource" },
      { model: "roughStone", field: "shape" },
      { model: "roughStone", field: "color" },
      { model: "roughStone", field: "transparency" },
      { model: "roughStone", field: "clarity" },
    ]),
  ]);
  const parcelOptions = parcels.map((p) => ({ id: p.id, code: p.code, name: p.code, supplier: p.supplier ? { name: p.supplier.name } : undefined }));
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Register rough stone</h1>
        <p className="text-sm text-muted-foreground">
          A new permanent Rough ID (<span className="font-mono">SGS-R-YYYY-######</span>) is minted on save.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>Rough details</CardTitle></CardHeader>
        <CardContent>
          <RoughForm suppliers={suppliers} parcels={parcelOptions} locations={locations} defaultCurrency={company.defaultCurrency} vocab={vocab} />
        </CardContent>
      </Card>
    </div>
  );
}
