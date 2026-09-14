import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { ScrollText } from "lucide-react";

export default async function AuditLogPage() {
  await requireCapability("audit:read");
  const entries = await prisma.auditLog.findMany({ orderBy: { at: "desc" }, take: 200 });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-3"><ScrollText className="h-7 w-7 text-sgs-teal-500" /> Audit log</h1>
        <p className="text-sm text-muted-foreground">Every significant change, forever. Nothing is silently overwritten.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">No audit entries yet.</TableCell></TableRow>
              )}
              {entries.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDateTime(a.at)}</TableCell>
                  <TableCell className="text-sm">{a.userName ?? "system"}</TableCell>
                  <TableCell><Badge variant="muted">{a.entity}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{a.entityCode ?? a.entityId.slice(0,8)}</TableCell>
                  <TableCell className="text-sm">{a.action}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.field ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {a.field ? <span className="text-muted-foreground">{a.oldValue ?? "∅"} → <span className="text-foreground">{a.newValue ?? "∅"}</span></span> : a.newValue ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
