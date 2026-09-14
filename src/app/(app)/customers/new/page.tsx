import { requireCapability } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerForm } from "../customer-form";

export default async function NewCustomerPage() {
  await requireCapability("customer:write");
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">New customer</h1>
        <p className="text-sm text-muted-foreground">A permanent Customer ID (<span className="font-mono">CUST-YYYY-####</span>) is minted on save.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent><CustomerForm /></CardContent>
      </Card>
    </div>
  );
}
