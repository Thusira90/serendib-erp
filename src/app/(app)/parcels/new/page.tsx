import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParcelIntakeForm } from "./parcel-intake-form";

export default async function NewParcelPage() {
  await requireCapability("rough:write");
  const [suppliers, locations] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.inventoryLocation.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">New parcel</h1>
        <p className="text-sm text-muted-foreground">
          Register a parcel from a supplier and every rough stone inside it in one go.
          If you leave a stone's price blank we'll auto-allocate the parcel total by weight.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>Intake</CardTitle></CardHeader>
        <CardContent>
          <ParcelIntakeForm suppliers={suppliers} locations={locations} />
        </CardContent>
      </Card>
    </div>
  );
}
