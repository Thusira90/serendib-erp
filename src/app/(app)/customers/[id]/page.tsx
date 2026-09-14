import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { parsePreferences } from "@/lib/customer-preferences";
import { ArrowLeft, User } from "lucide-react";
import { MatchingGemsPanel } from "./matches-panel";
import { CommentsThread } from "@/components/comments-thread";

const typeLabel: Record<string, string> = {
  COLLECTOR: "Collector", JEWELLER: "Jeweller", JEWELLERY_BRAND: "Jewelry Brand",
  DEALER: "Dealer", RETAILER: "Retailer", WHOLESALER: "Wholesaler",
  PRIVATE_BUYER: "Private Buyer", INTERNATIONAL_BUYER: "International Buyer",
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("customer:read");
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      enquiries: { orderBy: { createdAt: "desc" }, include: { gemstone: true } },
      quotations: { orderBy: { createdAt: "desc" }, include: { gemstone: true } },
      reservations: { orderBy: { reservedAt: "desc" }, include: { gemstone: true } },
      salesOrders: { orderBy: { saleDate: "desc" }, include: { gemstone: true, payments: true } },
      payments: { orderBy: { receivedAt: "desc" }, include: { salesOrder: true } },
    },
  });
  if (!customer) return notFound();
  const prefs = parsePreferences(customer.preferences);

  const totalSales = customer.salesOrders.reduce((s, so) => s + Number(so.totalAmount), 0);
  const totalPaid = customer.payments.reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = totalSales - totalPaid;

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link href="/customers" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to customers</Link>
      </div>

      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-sgs-gradient text-white grid place-items-center">
            <User className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3 text-xs">
              <Badge variant="teal">{typeLabel[customer.type]}</Badge>
              <span className="font-mono">{customer.code}</span>
            </div>
            <h1 className="font-serif text-3xl mt-1">{customer.displayName}</h1>
            {customer.companyName && <div className="text-sm text-muted-foreground">{customer.companyName}</div>}
            <div className="text-sm text-muted-foreground">
              {[customer.city, customer.country].filter(Boolean).join(", ") || "—"}
              {customer.email && ` · ${customer.email}`}
              {customer.phone && ` · ${customer.phone}`}
            </div>
          </div>
        </div>
        <div className="text-right">
          <MoneyTile label="Total sales" value={formatCurrency(totalSales)} />
          <MoneyTile label="Outstanding" value={formatCurrency(outstanding)} accent={outstanding > 0} />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="enquiries">Enquiries</TabsTrigger>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
          <TabsTrigger value="reservations">Reservations</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="matches">Best matches</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <KV label="Kind" value={customer.kind} />
                <KV label="Type" value={typeLabel[customer.type]} />
                <KV label="Country" value={customer.country ?? "—"} />
                <KV label="City" value={customer.city ?? "—"} />
                <KV label="Email" value={customer.email ?? "—"} />
                <KV label="Phone" value={customer.phone ?? "—"} />
                <KV label="Website" value={customer.website ?? "—"} span />
                <KV label="Address" value={customer.addressLine ?? "—"} span />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">
                {customer.notes || <span className="text-muted-foreground">No notes yet.</span>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader><CardTitle>Buying preferences</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <KV label="Gem types" value={prefs.gemTypes.join(", ") || "—"} />
              <KV label="Varieties" value={prefs.varieties.join(", ") || "—"} />
              <KV label="Origins" value={prefs.origins.join(", ") || "—"} />
              <KV label="Colors" value={prefs.colors.join(", ") || "—"} />
              <KV label="Shapes" value={prefs.shapes.join(", ") || "—"} />
              <KV label="Treatments" value={prefs.treatments.join(", ") || "—"} />
              <KV label="Weight range" value={prefs.minWeightCt != null || prefs.maxWeightCt != null ? `${prefs.minWeightCt ?? 0} – ${prefs.maxWeightCt ?? "∞"} ct` : "—"} />
              <KV label="Budget range" value={prefs.budgetMin != null || prefs.budgetMax != null ? `${formatCurrency(prefs.budgetMin ?? 0, prefs.currency)} – ${prefs.budgetMax != null ? formatCurrency(prefs.budgetMax, prefs.currency) : "∞"}` : "—"} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enquiries">
          <Card>
            <CardContent className="p-0 divide-y">
              {customer.enquiries.length === 0 && <div className="p-4 text-sm text-muted-foreground">No enquiries yet.</div>}
              {customer.enquiries.map((e) => (
                <div key={e.id} className="p-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-mono text-xs mr-2">{e.code}</span>
                    <Badge variant="muted">{e.status}</Badge>
                    <div className="text-muted-foreground mt-1">{e.requirement}</div>
                    {e.gemstone && (
                      <Link href={`/gemstones/${e.gemstone.id}`} className="text-xs text-sgs-teal-700 hover:underline">→ {e.gemstone.code}</Link>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDate(e.createdAt)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotations">
          <Card>
            <CardContent className="p-0 divide-y">
              {customer.quotations.length === 0 && <div className="p-4 text-sm text-muted-foreground">No quotations yet.</div>}
              {customer.quotations.map((q) => (
                <Link key={q.id} href={`/quotations/${q.id}`} className="p-3 flex items-center justify-between text-sm hover:bg-secondary/40">
                  <div>
                    <span className="font-mono text-xs mr-2">{q.code}</span>
                    <Badge variant="muted">{q.status}</Badge>
                    <div className="text-muted-foreground mt-1">{q.gemstone.gemType} — <span className="font-mono">{q.gemstone.code}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="num font-medium">{formatCurrency(Number(q.price), q.currency)}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(q.createdAt)}</div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reservations">
          <Card>
            <CardContent className="p-0 divide-y">
              {customer.reservations.length === 0 && <div className="p-4 text-sm text-muted-foreground">No reservations yet.</div>}
              {customer.reservations.map((r) => (
                <div key={r.id} className="p-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-mono text-xs mr-2">{r.code}</span>
                    <Badge variant={r.status === "ACTIVE" ? "warning" : r.status === "CONVERTED" ? "success" : "muted"}>{r.status}</Badge>
                    <Link href={`/gemstones/${r.gemstone.id}`} className="text-xs text-sgs-teal-700 hover:underline ml-2">{r.gemstone.code}</Link>
                  </div>
                  <div className="text-right">
                    <div className="num">{formatCurrency(Number(r.price), r.currency)}</div>
                    <div className="text-xs text-muted-foreground">Expires {formatDate(r.expiresAt)}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card>
            <CardContent className="p-0 divide-y">
              {customer.salesOrders.length === 0 && <div className="p-4 text-sm text-muted-foreground">No sales yet.</div>}
              {customer.salesOrders.map((s) => {
                const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
                const remaining = Number(s.totalAmount) - paid;
                return (
                  <Link key={s.id} href={`/sales/${s.id}`} className="p-3 flex items-center justify-between text-sm hover:bg-secondary/40">
                    <div>
                      <span className="font-mono text-xs mr-2">{s.code}</span>
                      <Badge variant={s.status === "PAID" ? "success" : s.status === "PARTIAL" ? "warning" : "muted"}>{s.status}</Badge>
                      <div className="text-muted-foreground mt-1">{s.gemstone.gemType} — <span className="font-mono">{s.gemstone.code}</span></div>
                    </div>
                    <div className="text-right">
                      <div className="num font-medium">{formatCurrency(Number(s.totalAmount), s.currency)}</div>
                      <div className="text-xs text-muted-foreground">Outstanding {formatCurrency(remaining, s.currency)}</div>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="p-0 divide-y">
              {customer.payments.length === 0 && <div className="p-4 text-sm text-muted-foreground">No payments recorded.</div>}
              {customer.payments.map((p) => (
                <div key={p.id} className="p-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-mono text-xs mr-2">{p.code}</span>
                    <span>{p.method.replaceAll("_", " ")}</span>
                    {p.reference && <span className="text-muted-foreground ml-2">Ref {p.reference}</span>}
                  </div>
                  <div className="text-right">
                    <div className="num">{formatCurrency(Number(p.amount), p.currency)}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(p.receivedAt)} · <Link href={`/sales/${p.salesOrderId}`} className="text-sgs-teal-700 hover:underline">{p.salesOrder.code}</Link></div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matches">
          <MatchingGemsPanel customerId={customer.id} />
        </TabsContent>

        <TabsContent value="notes">
          <CommentsThread entity="Customer" entityId={customer.id} entityCode={customer.code} revalidate={`/customers/${customer.id}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KV({ label, value, span = false }: { label: string; value: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
function MoneyTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-serif text-2xl num ${accent ? "text-sgs-purple-600" : ""}`}>{value}</div>
    </div>
  );
}
