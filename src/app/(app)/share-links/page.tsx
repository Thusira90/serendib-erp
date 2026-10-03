import { Link2 } from "lucide-react";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { CopyLinkButton } from "@/components/copy-link-button";
import { RevokeShareLinkButton } from "@/components/revoke-share-link-button";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type LinkRow = Awaited<ReturnType<typeof loadLinks>>[number];

function loadLinks(where: { createdById?: string }) {
  return prisma.shareLink.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 });
}

function statusOf(l: LinkRow, now: Date): "Active" | "Expired" | "Revoked" {
  if (l.revokedAt) return "Revoked";
  if (l.expiresAt < now) return "Expired";
  return "Active";
}

const STATUS_VARIANT = { Active: "success", Expired: "muted", Revoked: "danger" } as const;

const SCOPE_LABEL: Record<string, string> = {
  CATALOGUE: "Catalogue",
  GEMSTONE: "Single stone",
  GEMSTONES: "Selected stones",
  COLLECTION: "Collection",
  ROUGH: "Single rough",
  ROUGHS: "Selected roughs",
};

function CreatedBy({ l, showSharer }: { l: LinkRow; showSharer: boolean }) {
  if (!l.brokerMode) return <span>{l.createdByName}</span>;
  const broker = [l.brokerName, l.brokerCompany].filter(Boolean).join(" · ") || "Unnamed broker";
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="purple">Broker</Badge>
        <span>{broker}</span>
      </div>
      {showSharer && <div className="text-xs text-muted-foreground">created by {l.createdByName}</div>}
    </div>
  );
}

export default async function ShareLinksPage() {
  const session = await requireCapability("collection:read");
  const isAdmin = session.user.role === "SUPER_ADMIN" || session.user.role === "ADMINISTRATOR";
  const links = await loadLinks(isAdmin ? {} : { createdById: session.user.id });
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-3">
          <Link2 className="h-7 w-7 text-sgs-purple-500" /> Share links
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? "Every public share link created in the system." : "Public share links you have created."}{" "}
          Revoking a link stops it working straight away.
        </p>
      </div>

      {links.length === 0 ? (
        <Card>
          <CardContent className="p-2">
            <EmptyState
              icon={Link2}
              title="No share links yet"
              description="A share link gives a customer or broker a time-limited public page for one stone, a selection of stones, or the whole catalogue. Create one with the Share button on a stone, a rough, the catalogue or a collection, and it will show up here so you can copy or revoke it."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Created by</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {links.map((l) => {
                      const status = statusOf(l, now);
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-mono text-xs">{l.code}</TableCell>
                          <TableCell className="text-sm">{SCOPE_LABEL[l.scope] ?? l.scope}</TableCell>
                          <TableCell className="text-sm"><CreatedBy l={l} showSharer={isAdmin} /></TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDateTime(l.createdAt)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDateTime(l.expiresAt)}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.viewCount}</TableCell>
                          <TableCell><Badge variant={STATUS_VARIANT[status]}>{status}</Badge></TableCell>
                          <TableCell>
                            {status === "Active" ? (
                              <div className="flex items-start gap-2">
                                <div className="min-w-[280px]"><CopyLinkButton path={`/s/${l.code}`} public label="Link" /></div>
                                <RevokeShareLinkButton id={l.id} code={l.code} />
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {status === "Revoked" ? `Revoked ${formatDateTime(l.revokedAt)}` : "No longer active"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3 md:hidden">
            {links.map((l) => {
              const status = statusOf(l, now);
              return (
                <Card key={l.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-sm">{l.code}</div>
                        <div className="text-xs text-muted-foreground">{SCOPE_LABEL[l.scope] ?? l.scope}</div>
                      </div>
                      <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
                    </div>
                    <div className="text-sm"><CreatedBy l={l} showSharer={isAdmin} /></div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">Created</dt>
                      <dd className="text-right">{formatDateTime(l.createdAt)}</dd>
                      <dt className="text-muted-foreground">Expires</dt>
                      <dd className="text-right">{formatDateTime(l.expiresAt)}</dd>
                      <dt className="text-muted-foreground">Views</dt>
                      <dd className="text-right tabular-nums">{l.viewCount}</dd>
                    </dl>
                    {status === "Active" && (
                      <div className="space-y-2">
                        <CopyLinkButton path={`/s/${l.code}`} public label="Link" />
                        <RevokeShareLinkButton id={l.id} code={l.code} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
