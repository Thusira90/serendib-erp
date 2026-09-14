import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Warehouse } from "lucide-react";
import { NewLocationButton } from "./new-location-button";

type Node = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  children: Node[];
  roughCount: number;
  gemCount: number;
};

export default async function LocationsPage() {
  const session = await requireCapability("location:read");
  const canWrite = can(session.user.role, "location:write");
  const [locations, roughCounts, gemCounts] = await Promise.all([
    prisma.inventoryLocation.findMany({ orderBy: { code: "asc" } }),
    prisma.roughStone.groupBy({ by: ["locationId"], _count: { _all: true } }),
    prisma.gemstone.groupBy({ by: ["locationId"], _count: { _all: true } }),
  ]);
  const roughByLoc = new Map(roughCounts.map((r) => [r.locationId, r._count._all]));
  const gemByLoc = new Map(gemCounts.map((g) => [g.locationId, g._count._all]));

  const byId = new Map<string, Node>();
  locations.forEach((l) => {
    byId.set(l.id, {
      id: l.id, code: l.code, name: l.name, parentId: l.parentId,
      children: [],
      roughCount: roughByLoc.get(l.id) ?? 0,
      gemCount: gemByLoc.get(l.id) ?? 0,
    });
  });
  const roots: Node[] = [];
  byId.forEach((n) => {
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n);
    else roots.push(n);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Warehouse className="h-7 w-7 text-sgs-teal-500" /> Inventory locations</h1>
          <p className="text-sm text-muted-foreground">Physical storage hierarchy — vault → cabinet → tray.</p>
        </div>
        {canWrite && <NewLocationButton parents={locations.map((l) => ({ id: l.id, code: l.code, name: l.name }))} />}
      </div>
      <Card>
        <CardHeader><CardTitle>Location tree</CardTitle></CardHeader>
        <CardContent>
          {roots.length === 0 && <div className="text-sm text-muted-foreground">No locations defined.</div>}
          <ul className="space-y-1">
            {roots.map((n) => <TreeRow key={n.id} node={n} depth={0} />)}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function TreeRow({ node, depth }: { node: Node; depth: number }) {
  return (
    <li>
      <div className="flex items-center justify-between py-1.5 pr-2 rounded hover:bg-secondary/40" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">{node.code}</span>
          <span className="text-sm">{node.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {node.roughCount > 0 && <Badge variant="teal">{node.roughCount} rough</Badge>}
          {node.gemCount > 0 && <Badge variant="purple">{node.gemCount} gems</Badge>}
        </div>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => <TreeRow key={c.id} node={c} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}
