import { requireCapability, can } from "@/lib/rbac";
import { getCompanySettings } from "@/lib/company-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const session = await requireCapability("settings:read");
  const canWrite = can(session.user.role, "settings:write");
  const settings = await getCompanySettings();
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Company settings</h1>
        <p className="text-sm text-muted-foreground">
          These values flow into quotation PDFs, invoices, the public verification page,
          and the catalogue footer.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>Company profile</CardTitle></CardHeader>
        <CardContent>
          <SettingsForm existing={settings} canWrite={canWrite} />
        </CardContent>
      </Card>
    </div>
  );
}
