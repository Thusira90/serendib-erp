import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCapability, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { formatCarat, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { buildGemstoneGenealogy } from "@/lib/genealogy";
import { GenealogyTree } from "@/components/genealogy-tree";
import { ArrowLeft, Gem, TrendingUp, Coins, Layers } from "lucide-react";
import { CertificationTab } from "./tabs/certification-tab";
import { CgiTab } from "./tabs/cgi-tab";
import { PhotographyTab } from "./tabs/photography-tab";
import { CostingTab } from "./tabs/costing-tab";
import { PricingTab } from "./tabs/pricing-tab";
import { CommerceSection } from "./tabs/commerce-section";
import { MatchingCustomersPanel } from "./tabs/matches-tab";
import { QrCard } from "@/components/qr-card";
import { MoveButton } from "@/components/move-button";
import { EditGemstoneButton } from "./edit-gemstone-button";
import { CommentsThread } from "@/components/comments-thread";

export default async function GemstoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("gemstone:read");
  const { id } = await params;

  const g = await prisma.gemstone.findUnique({
    where: { id },
    include: {
      location: true,
      costAllocations: { orderBy: { incurredAt: "asc" } },
      priceHistory: { orderBy: { changedAt: "desc" } },
      certificates: { orderBy: { createdAt: "desc" }, include: { laboratory: true } },
      cgiProjects: {
        orderBy: { createdAt: "desc" },
        include: { versions: { orderBy: { version: "asc" } } },
      },
      digitalAssets: { orderBy: { createdAt: "desc" } },
      reservations: { orderBy: { reservedAt: "desc" }, include: { customer: true } },
      salesOrders: { orderBy: { saleDate: "desc" }, include: { customer: true }, take: 1 },
    },
  });
  if (!g) return notFound();

  const [genealogy, audit, labs, customers, locations] = await Promise.all([
    buildGemstoneGenealogy(g.id),
    prisma.auditLog.findMany({ where: { entity: "Gemstone", entityId: g.id }, orderBy: { at: "desc" }, take: 30 }),
    prisma.laboratory.findMany({ orderBy: { name: "asc" } }),
    prisma.customer.findMany({ orderBy: { displayName: "asc" } }),
    prisma.inventoryLocation.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  const canMove = can(session.user.role, "location:write");
  const canEditGem = can(session.user.role, "gemstone:write");

  const activeReservation = g.reservations.find((r) => r.status === "ACTIVE") ?? null;
  const sale = g.salesOrders[0] ?? null;
  const canReserve = can(session.user.role, "reservation:write");
  const canSell = can(session.user.role, "sale:write");

  const canCert = can(session.user.role, "certificate:write");
  const canCgi = can(session.user.role, "cgi:write");
  const canMedia = can(session.user.role, "media:write");
  const canCost = can(session.user.role, "cost:write");
  const canPrice = can(session.user.role, "price:write");

  const margin = g.askingPrice != null ? Number(g.askingPrice) - Number(g.totalCost) : null;
  const marginPct = margin != null && Number(g.askingPrice) > 0 ? (margin / Number(g.askingPrice)) : null;

  // Digital-readiness state derived from actual records.
  const hasCertIssued = g.certificates.some((c) => c.status === "ISSUED");
  const hasCertAny = g.certificates.length > 0;
  const hasPhoto = g.digitalAssets.some((a) => ["FINISHED_PHOTO", "MACRO_PHOTO", "CATALOGUE_IMAGE"].includes(a.kind));
  const hasCgiMaster = g.cgiProjects.some((p) => p.versions.some((v) => v.isMaster));
  const hasCgiAny = g.cgiProjects.length > 0;
  const hasPricing = g.askingPrice != null;

  const primaryPhoto = g.digitalAssets.find(
    (a) => a.isPrimary && ["FINISHED_PHOTO", "MACRO_PHOTO", "CATALOGUE_IMAGE"].includes(a.kind)
  ) ?? g.digitalAssets.find((a) => ["FINISHED_PHOTO", "MACRO_PHOTO", "CATALOGUE_IMAGE"].includes(a.kind));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <Link href="/gemstones" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to finished gemstones</Link>
        {canEditGem && (
          <EditGemstoneButton
            gem={{
              id: g.id, code: g.code,
              gemType: g.gemType, variety: g.variety, species: g.species,
              origin: g.origin, treatment: g.treatment, treatmentStatus: g.treatmentStatus,
              weightCt: Number(g.weightCt),
              lengthMm: g.lengthMm != null ? Number(g.lengthMm) : null,
              widthMm: g.widthMm != null ? Number(g.widthMm) : null,
              depthMm: g.depthMm != null ? Number(g.depthMm) : null,
              shape: g.shape, cut: g.cut, facetingStyle: g.facetingStyle,
              colorDescription: g.colorDescription, clarity: g.clarity,
              luster: g.luster, fluorescence: g.fluorescence,
              symmetry: g.symmetry, polish: g.polish,
              inclusions: g.inclusions,
              status: g.status,
              locationId: g.locationId,
            }}
            locations={locations}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <div className="rounded-lg overflow-hidden bg-sgs-gradient text-white p-6 flex flex-col relative">
          {primaryPhoto?.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={primaryPhoto.url} alt={g.code} className="absolute inset-0 h-full w-full object-cover mix-blend-luminosity opacity-60" />
          )}
          <div className="relative">
            <Gem className="h-8 w-8 opacity-90" />
          </div>
          <div className="mt-auto relative">
            <div className="text-[10px] uppercase tracking-widest opacity-80">{g.gemType}{g.variety ? ` · ${g.variety}` : ""}</div>
            <div className="font-serif text-5xl mt-1 num">{formatCarat(Number(g.weightCt))}</div>
            <div className="text-xs opacity-85 mt-1 font-mono">{g.code}</div>
            <div className="mt-3"><StatusBadge status={g.status} kind="gemstone" /></div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-4xl">{g.gemType}{g.variety ? ` · ${g.variety}` : ""}</h1>
              <div className="text-sm text-muted-foreground mt-1">
                {g.origin ?? "Origin unknown"}
                {g.treatment ? ` · ${g.treatment}` : ""}
                {g.location ? ` · ${g.location.name}` : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Asking</div>
              <div className="font-serif text-3xl num">{g.askingPrice ? formatCurrency(Number(g.askingPrice), g.currency) : "—"}</div>
              {g.pricePerCt && <div className="text-xs text-muted-foreground">{formatCurrency(Number(g.pricePerCt), g.currency)} / ct</div>}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat icon={<Coins className="h-4 w-4" />} label="True cost" value={formatCurrency(Number(g.totalCost), g.currency)} />
            <MiniStat icon={<TrendingUp className="h-4 w-4" />} label="Est. margin" value={margin != null ? formatCurrency(margin, g.currency) : "—"} accent={margin != null && margin >= 0} />
            <MiniStat icon={<Layers className="h-4 w-4" />} label="Cost / ct" value={formatCurrency(Number(g.costPerCt), g.currency)} />
            <MiniStat icon={<TrendingUp className="h-4 w-4" />} label="Margin %" value={marginPct != null ? `${(marginPct * 100).toFixed(1)}%` : "—"} accent={marginPct != null && marginPct >= 0} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="specs">Specifications</TabsTrigger>
          <TabsTrigger value="genealogy">Genealogy</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="certification">Certification{hasCertIssued && " ✓"}</TabsTrigger>
          <TabsTrigger value="photography">Photography{hasPhoto && " ✓"}</TabsTrigger>
          <TabsTrigger value="cgi">CGI{hasCgiMaster && " ✓"}</TabsTrigger>
          <TabsTrigger value="costing">Costing</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="commerce">Commerce</TabsTrigger>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Identity</CardTitle>
                {canMove && <MoveButton itemKind="GEMSTONE" gemstoneId={g.id} currentLocationId={g.locationId} locations={locations} />}
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <KV label="Gem ID" value={<span className="font-mono">{g.code}</span>} />
                <KV label="Type" value={g.gemType} />
                <KV label="Variety" value={g.variety ?? "—"} />
                <KV label="Species" value={g.species ?? "—"} />
                <KV label="Origin" value={g.origin ?? "—"} />
                <KV label="Treatment" value={g.treatment ?? "—"} />
                <KV label="Treatment status" value={g.treatmentStatus ?? "—"} />
                <KV label="Location" value={g.location?.name ?? "—"} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Digital readiness</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <ReadinessRow label="Certificate" ready={hasCertIssued} partial={hasCertAny && !hasCertIssued} />
                <ReadinessRow label="Photography" ready={hasPhoto} />
                <ReadinessRow label="CGI (master)" ready={hasCgiMaster} partial={hasCgiAny && !hasCgiMaster} />
                <ReadinessRow label="Pricing" ready={hasPricing} />
                <ReadinessRow label="Description" ready={!!g.colorDescription || !!g.variety} />
                <ReadinessRow label="Public verification" ready={true} />
                <div className="pt-2 text-xs text-muted-foreground">
                  Public verification page is live at{" "}
                  <a href={`/verify/${g.code}`} target="_blank" rel="noreferrer" className="text-sgs-teal-700 hover:underline font-mono">/verify/{g.code}</a>.
                </div>
              </CardContent>
            </Card>
            <QrCard code={g.code} kind="gemstone" label={`${g.gemType}${g.variety ? ` · ${g.variety}` : ""}`} />
          </div>
        </TabsContent>

        <TabsContent value="specs">
          <Card>
            <CardHeader><CardTitle>Specifications</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <KV label="Weight" value={formatCarat(Number(g.weightCt))} />
              <KV label="Dimensions" value={[g.lengthMm, g.widthMm, g.depthMm].filter(Boolean).map(v => `${Number(v).toFixed(1)}mm`).join(" × ") || "—"} />
              <KV label="Shape" value={g.shape ?? "—"} />
              <KV label="Cut" value={g.cut ?? "—"} />
              <KV label="Faceting style" value={g.facetingStyle ?? "—"} />
              <KV label="Hue" value={g.colorHue ?? "—"} />
              <KV label="Tone" value={g.colorTone ?? "—"} />
              <KV label="Saturation" value={g.colorSaturation ?? "—"} />
              <KV label="Color" value={g.colorDescription ?? "—"} span />
              <KV label="Clarity" value={g.clarity ?? "—"} />
              <KV label="Transparency" value={g.transparency ?? "—"} />
              <KV label="Luster" value={g.luster ?? "—"} />
              <KV label="Fluorescence" value={g.fluorescence ?? "—"} />
              <KV label="Symmetry" value={g.symmetry ?? "—"} />
              <KV label="Polish" value={g.polish ?? "—"} />
              <KV label="Inclusions" value={g.inclusions ?? "—"} span />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="genealogy">
          <Card>
            <CardHeader><CardTitle>Parent rough & transformation</CardTitle></CardHeader>
            <CardContent><GenealogyTree root={genealogy} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative border-l pl-6 space-y-4">
                <TimelineItem date={g.createdAt} label="Gemstone record created" />
                {g.certificates.map((c) => c.submissionDate && (
                  <TimelineItem key={`sub-${c.id}`} date={c.submissionDate} label={`Submitted to ${c.laboratory.name} — ${c.type}`} />
                ))}
                {g.certificates.map((c) => c.issueDate && (
                  <TimelineItem key={`iss-${c.id}`} date={c.issueDate} label={`Certificate issued by ${c.laboratory.name}${c.certificateNumber ? ` (#${c.certificateNumber})` : ""}`} />
                ))}
                {g.cgiProjects.map((p) => (
                  <TimelineItem key={`cgi-${p.id}`} date={p.createdAt} label={`CGI project ${p.code} opened${p.artist ? ` — ${p.artist}` : ""}`} />
                ))}
                {g.digitalAssets.map((a) => (
                  <TimelineItem key={`asset-${a.id}`} date={a.createdAt} label={`${a.kind.replaceAll("_", " ")} added${a.caption ? `: ${a.caption}` : ""}`} />
                ))}
                {g.priceHistory.map((p) => (
                  <TimelineItem key={p.id} date={p.changedAt} label={`Price ${p.oldPrice ? `${formatCurrency(Number(p.oldPrice))} →` : "set to"} ${formatCurrency(Number(p.newPrice))}${p.reason ? ` — ${p.reason}` : ""}`} />
                ))}
                <TimelineItem date={g.updatedAt} label="Last updated" muted />
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certification">
          <CertificationTab
            gemstoneId={g.id}
            labs={labs.map((l) => ({ id: l.id, code: l.code, name: l.name, country: l.country }))}
            certificates={g.certificates.map((c) => ({
              id: c.id, code: c.code,
              certificateNumber: c.certificateNumber, type: c.type, status: c.status,
              laboratory: { id: c.laboratory.id, code: c.laboratory.code, name: c.laboratory.name, country: c.laboratory.country },
              issueDate: c.issueDate, submissionDate: c.submissionDate, returnDate: c.returnDate,
              originDetermination: c.originDetermination, treatmentDetermination: c.treatmentDetermination,
              weightCt: c.weightCt != null ? Number(c.weightCt) : null,
              colorGrade: c.colorGrade, comments: c.comments,
              laboratoryFees: c.laboratoryFees != null ? Number(c.laboratoryFees) : null,
              currency: c.currency,
              documentUrl: c.documentUrl, imageUrl: c.imageUrl,
            }))}
            canWrite={canCert}
          />
        </TabsContent>

        <TabsContent value="photography">
          <PhotographyTab
            gemstoneId={g.id}
            assets={g.digitalAssets.map((a) => ({
              id: a.id, kind: a.kind, url: a.url, caption: a.caption,
              isPrimary: a.isPrimary, contentType: a.contentType, originalName: a.originalName,
              createdAt: a.createdAt,
            }))}
            canWrite={canMedia}
          />
        </TabsContent>

        <TabsContent value="cgi">
          <CgiTab
            gemstoneId={g.id}
            projects={g.cgiProjects.map((p) => ({
              id: p.id, code: p.code, artist: p.artist, software: p.software,
              softwareVersion: p.softwareVersion, status: p.status, notes: p.notes,
              createdAt: p.createdAt,
              versions: p.versions.map((v) => ({
                id: v.id, code: v.code, version: v.version, isMaster: v.isMaster,
                approvedAt: v.approvedAt, approvedBy: v.approvedBy,
                renderUrl: v.renderUrl, animationUrl: v.animationUrl,
                thumbnailUrl: v.thumbnailUrl, modelUrl: v.modelUrl,
                notes: v.notes, createdAt: v.createdAt,
              })),
            }))}
            canWrite={canCgi}
          />
        </TabsContent>

        <TabsContent value="costing">
          <CostingTab
            gemstoneId={g.id}
            costs={g.costAllocations.map((c) => ({
              id: c.id, type: c.type, description: c.description,
              amount: Number(c.amount), currency: c.currency, incurredAt: c.incurredAt,
            }))}
            totalCost={Number(g.totalCost)}
            currency={g.currency}
            canWrite={canCost}
          />
        </TabsContent>

        <TabsContent value="pricing">
          <PricingTab
            gemstoneId={g.id}
            priceHistory={g.priceHistory.map((p) => ({
              id: p.id, oldPrice: p.oldPrice != null ? Number(p.oldPrice) : null,
              newPrice: Number(p.newPrice), currency: p.currency,
              reason: p.reason, changedBy: p.changedBy, changedAt: p.changedAt,
            }))}
            currentPrice={g.askingPrice != null ? Number(g.askingPrice) : null}
            currency={g.currency}
            canWrite={canPrice}
          />
        </TabsContent>

        <TabsContent value="commerce">
          <CommerceSection
            gemstoneId={g.id}
            status={g.status}
            askingPrice={g.askingPrice != null ? Number(g.askingPrice) : null}
            currency={g.currency}
            customers={customers.map((c) => ({ id: c.id, code: c.code, displayName: c.displayName }))}
            activeReservation={activeReservation ? {
              id: activeReservation.id, code: activeReservation.code,
              customer: { id: activeReservation.customer.id, displayName: activeReservation.customer.displayName },
              price: Number(activeReservation.price),
              deposit: activeReservation.deposit != null ? Number(activeReservation.deposit) : null,
              currency: activeReservation.currency,
              expiresAt: activeReservation.expiresAt,
              reservedAt: activeReservation.reservedAt,
            } : null}
            sale={sale ? {
              id: sale.id, code: sale.code, invoiceNumber: sale.invoiceNumber,
              customer: { id: sale.customer.id, displayName: sale.customer.displayName },
              totalAmount: Number(sale.totalAmount),
              currency: sale.currency,
              saleDate: sale.saleDate,
            } : null}
            canReserve={canReserve}
            canSell={canSell}
          />
        </TabsContent>

        <TabsContent value="matches">
          <MatchingCustomersPanel gemstoneId={g.id} />
        </TabsContent>

        <TabsContent value="notes">
          <CommentsThread entity="Gemstone" entityId={g.id} entityCode={g.code} revalidate={`/gemstones/${g.id}`} />
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle>Audit trail</CardTitle></CardHeader>
            <CardContent className="divide-y">
              {audit.length === 0 && <div className="text-sm text-muted-foreground py-4">No history yet.</div>}
              {audit.map((a) => (
                <div key={a.id} className="py-2 flex items-center justify-between text-sm">
                  <div><Badge variant="muted" className="mr-2">{a.action}</Badge>{a.field && <span className="text-muted-foreground">{a.field}: {a.oldValue ?? "∅"} → {a.newValue ?? "∅"}</span>}{!a.field && a.newValue && <span>{a.newValue}</span>}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(a.at)} · {a.userName ?? "system"}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MiniStat({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">{icon} {label}</div>
      <div className={`font-serif text-xl mt-0.5 num ${accent ? "text-sgs-purple-600" : ""}`}>{value}</div>
    </div>
  );
}
function KV({ label, value, span = false }: { label: string; value: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? "col-span-2 md:col-span-3" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
function TimelineItem({ date, label, muted = false }: { date: Date; label: string; muted?: boolean }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full ${muted ? "bg-muted-foreground/30" : "bg-sgs-purple-500"}`} />
      <div className="text-xs text-muted-foreground">{formatDate(date)}</div>
      <div className="text-sm">{label}</div>
    </li>
  );
}
function ReadinessRow({ label, ready, partial = false }: { label: string; ready: boolean; partial?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      {ready ? <Badge variant="success">Ready</Badge>
        : partial ? <Badge variant="warning">In progress</Badge>
        : <Badge variant="muted">Pending</Badge>}
    </div>
  );
}
