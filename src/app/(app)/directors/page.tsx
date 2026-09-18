import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { NewDirectorButton } from "./new-director-button";
import { Crown, Users, ExternalLink } from "lucide-react";

/**
 * Directors list — the people holding board seats. Ownership lives on the
 * share register and is displayed on the /capital ledger; this page is
 * intentionally a people register, not an ownership one.
 */
export default async function DirectorsPage() {
  const session = await requireCapability("director:read");
  const canWrite = can(session.user.role, "director:write");
  const directors = await prisma.director.findMany({
    orderBy: [{ active: "desc" }, { joinedAt: "asc" }, { name: "asc" }],
    include: { shareholder: { include: { lots: true } } },
  });

  const activeCount = directors.filter((d) => d.active).length;
  const withShares = directors.filter((d) => d.shareholder && d.shareholder.lots.some((l) => Number(l.numberOfShares) > 0)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3">
            <Crown className="h-7 w-7 text-sgs-purple-500" /> Directors
          </h1>
          <p className="text-sm text-muted-foreground">
            Board seats. See <Link href="/shareholders" className="text-sgs-teal-700 hover:underline">Shareholders</Link>{" "}
            for the share register and <Link href="/capital" className="text-sgs-teal-700 hover:underline">Capital ledger</Link>{" "}
            for money movement.
          </p>
        </div>
        {canWrite && <NewDirectorButton />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Active directors" value={String(activeCount)} />
        <Stat label="Also shareholders" value={String(withShares)} />
        <Stat label="Total directors on file" value={String(directors.length)} />
        <Stat label="Inactive / left" value={String(directors.length - activeCount)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Director</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Shareholder</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {directors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                    <Users className="h-6 w-6 mx-auto mb-2 opacity-40" />
                    No directors yet. {canWrite && "Add one with the button above."}
                  </TableCell>
                </TableRow>
              )}
              {directors.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell>
                    <Link href={`/directors/${d.id}`} className="text-sgs-teal-700 hover:underline font-medium">
                      {d.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{d.role}</TableCell>
                  <TableCell className="text-xs">
                    {d.email && <div>{d.email}</div>}
                    {d.phone && <div className="text-muted-foreground">{d.phone}</div>}
                    {!d.email && !d.phone && "—"}
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(d.joinedAt)}</TableCell>
                  <TableCell className="text-xs">
                    {d.shareholder ? (
                      <Link href={`/shareholders/${d.shareholder.id}`} className="inline-flex items-center gap-1 text-sgs-teal-700 hover:underline">
                        {d.shareholder.code} <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.active ? "success" : "muted"}>{d.active ? "Active" : "Inactive"}</Badge>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-serif text-2xl num mt-1">{value}</div>
    </CardContent></Card>
  );
}
