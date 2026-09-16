import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatCarat, formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, LayoutGrid, Eye, ExternalLink, Trash2, Archive } from "lucide-react";
import { archiveCollection, removeStoneFromCollection, updateCollectionItem, updateCollectionMeta } from "../actions";
import { CopyShareLinkButton } from "./copy-share-link";

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("collection:read");
  const canWrite = can(session.user.role, "collection:write");
  const { id } = await params;

  const [collection, customers] = await Promise.all([
    prisma.collection.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          orderBy: { displayOrder: "asc" },
          include: {
            gemstone: {
              include: {
                digitalAssets: { where: { isPrimary: true }, take: 1 },
              },
            },
          },
        },
      },
    }),
    prisma.customer.findMany({
      orderBy: { displayName: "asc" },
      select: { id: true, code: true, displayName: true, companyName: true },
    }),
  ]);
  if (!collection) return notFound();

  // Build the absolute share URL from the request host so users can copy it
  // straight to a WhatsApp / email without editing the origin.
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = `${proto}://${host}/share/${collection.shareCode}`;
  const expired = collection.expiresAt && collection.expiresAt < new Date();

  return (
    <div className="space-y-6">
      <Link href="/collections" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to collections
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
            <LayoutGrid className="h-3.5 w-3.5 text-sgs-purple-500" /> {collection.code}
            {collection.isArchived && <Badge variant="muted">Archived</Badge>}
            {expired && <Badge variant="danger">Expired</Badge>}
          </div>
          <h1 className="font-serif text-3xl mt-1">{collection.name}</h1>
          {collection.customer && (
            <div className="text-sm text-muted-foreground mt-1">
              For <Link href={`/customers/${collection.customerId}`} className="text-sgs-teal-700 hover:underline">{collection.customer.displayName}</Link>
              {collection.customer.companyName && <> · {collection.customer.companyName}</>}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stones ({collection.items.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {collection.items.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">
                No stones added yet. Open any finished gemstone and click <span className="font-medium">Add to collection</span>.
              </div>
            ) : (
              <div className="divide-y">
                {collection.items.map((item) => {
                  const primaryImg = item.gemstone.digitalAssets[0]?.url;
                  return (
                    <div key={item.id} className="p-4 flex items-start gap-4">
                      <div className="h-20 w-20 rounded-md overflow-hidden bg-sgs-gradient-soft grid place-items-center shrink-0">
                        {primaryImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={primaryImg} alt={item.gemstone.code} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">No photo</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <Link href={`/gemstones/${item.gemstone.id}`} className="font-mono text-sgs-teal-700 hover:underline">{item.gemstone.code}</Link>
                          <Badge variant="muted">{item.gemstone.status}</Badge>
                        </div>
                        <div className="font-medium text-sm mt-0.5">
                          {item.gemstone.gemType}{item.gemstone.variety ? ` · ${item.gemstone.variety}` : ""}
                          {" · "}<span className="num text-muted-foreground">{formatCarat(Number(item.gemstone.weightCt))}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          List: {item.gemstone.askingPrice != null ? formatCurrency(Number(item.gemstone.askingPrice), item.gemstone.currency) : "—"}
                          {item.priceOverride != null && (
                            <> · Override: <span className="text-sgs-purple-700 font-medium">{formatCurrency(Number(item.priceOverride), item.currency ?? item.gemstone.currency)}</span></>
                          )}
                        </div>
                        {canWrite && (
                          <form action={updateCollectionItem} className="mt-3 grid grid-cols-[1fr_200px_auto] gap-2 items-end">
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="displayOrder" value={item.displayOrder} />
                            <div className="space-y-0.5">
                              <Label className="text-[10px]">Note to customer</Label>
                              <Input name="note" defaultValue={item.note ?? ""} placeholder="Perfect for bridal collection…" className="h-8 text-xs" />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[10px]">Price override</Label>
                              <CurrencyInput
                                amountName="priceOverride"
                                currencyName="currency"
                                size="sm"
                                defaultAmount={item.priceOverride?.toString() ?? ""}
                                defaultCurrency={item.currency ?? item.gemstone.currency}
                              />
                            </div>
                            <Button size="sm" variant="outline" className="h-8">Save</Button>
                          </form>
                        )}
                        {item.note && !canWrite && (
                          <div className="text-xs text-muted-foreground italic mt-1">&ldquo;{item.note}&rdquo;</div>
                        )}
                      </div>
                      {canWrite && (
                        <form action={removeStoneFromCollection}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <Button size="sm" variant="ghost" className="text-red-700"><Trash2 className="h-4 w-4" /></Button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Eye className="h-4 w-4 text-sgs-teal-500" /> Share</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="border rounded-md p-3 bg-secondary/40">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Public link</div>
                <div className="font-mono text-xs break-all">{shareUrl}</div>
              </div>
              <div className="flex gap-2">
                <CopyShareLinkButton url={shareUrl} />
                <Button asChild size="sm" variant="outline"><Link href={`/share/${collection.shareCode}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open</Link></Button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Views</div>
                  <div className="font-serif text-2xl num">{collection.viewCount}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Last viewed</div>
                  <div className="text-sm mt-1">{collection.lastViewedAt ? formatDate(collection.lastViewedAt) : "Never"}</div>
                </div>
              </div>
              {collection.expiresAt && (
                <div className="text-xs text-muted-foreground border-t pt-2">
                  Link {expired ? "expired on" : "expires on"} <span className="font-medium">{formatDate(collection.expiresAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {canWrite && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Settings</CardTitle></CardHeader>
              <CardContent>
                <form action={updateCollectionMeta} className="space-y-3">
                  <input type="hidden" name="id" value={collection.id} />
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input name="name" defaultValue={collection.name} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Intro</Label>
                    <Textarea name="intro" defaultValue={collection.intro ?? ""} rows={3} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>For customer</Label>
                    <select name="customerId" defaultValue={collection.customerId ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">— General —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.displayName}{c.companyName ? ` · ${c.companyName}` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expires on</Label>
                    <Input name="expiresAt" type="date" defaultValue={collection.expiresAt ? collection.expiresAt.toISOString().slice(0, 10) : ""} />
                  </div>
                  <Button className="w-full">Save settings</Button>
                </form>
                <form action={archiveCollection} className="mt-3 pt-3 border-t">
                  <input type="hidden" name="id" value={collection.id} />
                  <Button variant="outline" className="w-full text-red-700"><Archive className="h-4 w-4" /> Archive collection</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
