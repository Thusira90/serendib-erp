import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { LayoutGrid, Plus, Eye, ExternalLink } from "lucide-react";

export default async function CollectionsPage() {
  const session = await requireCapability("collection:read");
  const canWrite = can(session.user.role, "collection:write");

  const collections = await prisma.collection.findMany({
    where: { isArchived: false },
    orderBy: { updatedAt: "desc" },
    include: {
      customer: true,
      _count: { select: { items: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3">
            <LayoutGrid className="h-7 w-7 text-sgs-purple-500" /> Collections
          </h1>
          <p className="text-sm text-muted-foreground">
            Curated bundles you can share with customers via a public link.
          </p>
        </div>
        {canWrite && (
          <Button asChild variant="accent"><Link href="/collections/new"><Plus className="h-4 w-4" /> New collection</Link></Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>For</TableHead>
                <TableHead className="text-right">Stones</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead>Last viewed</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Share link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collections.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                    No collections yet.
                    {canWrite && <> <Link href="/collections/new" className="text-sgs-teal-700 hover:underline">Build the first one →</Link></>}
                  </TableCell>
                </TableRow>
              )}
              {collections.map((c) => {
                const expired = c.expiresAt && c.expiresAt < new Date();
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/collections/${c.id}`} className="text-sgs-teal-700 hover:underline">{c.code}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/collections/${c.id}`} className="hover:text-sgs-teal-700">{c.name}</Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.customer ? (
                        <Link href={`/customers/${c.customerId}`} className="text-sgs-teal-700 hover:underline">{c.customer.displayName}</Link>
                      ) : (
                        <span className="text-muted-foreground">General</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{c._count.items}</TableCell>
                    <TableCell className="text-right"><Badge variant={c.viewCount > 0 ? "teal" : "muted"}>{c.viewCount}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(c.lastViewedAt)}</TableCell>
                    <TableCell className="text-xs">
                      {expired
                        ? <Badge variant="danger">Expired</Badge>
                        : c.expiresAt
                          ? formatDate(c.expiresAt)
                          : <span className="text-muted-foreground">Never</span>}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/share/${c.shareCode}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sgs-teal-700 hover:underline font-mono"
                      >
                        <Eye className="h-3 w-3" /> /share/{c.shareCode} <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
