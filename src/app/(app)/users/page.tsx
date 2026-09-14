import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { roleLabels } from "@/lib/rbac";
import type { Role } from "@/lib/enums";
import { ChangeRoleInline, NewUserButton, ResetPasswordButton, ToggleActiveButton } from "./user-actions";

export default async function UsersPage() {
  const session = await requireCapability("user:manage");
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Users className="h-7 w-7 text-sgs-teal-500" /> Users</h1>
          <p className="text-sm text-muted-foreground">Team members and their permission scope.</p>
        </div>
        <NewUserButton />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[280px]">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === session.user.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      {u.name} {isSelf && <Badge variant="muted" className="ml-2 text-[9px]">You</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <ChangeRoleInline userId={u.id} currentRole={u.role} disabled={isSelf} />
                    </TableCell>
                    <TableCell>{u.active ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Disabled</Badge>}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1 flex-wrap">
                        <ResetPasswordButton userId={u.id} />
                        <ToggleActiveButton userId={u.id} active={u.active} disabled={isSelf} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Roles are enforced by RBAC across every server action. See{" "}
        <span className="font-mono">src/lib/rbac.ts</span> for the capability matrix.
        The label under each role name in the header is what the sidebar reads.
      </p>
    </div>
  );
}

// Kept for future use — currently rendered via ChangeRoleInline.
void roleLabels;
export type _Role = Role;
