import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Award } from "lucide-react";

const statusVariant = (s: string) =>
  s === "ISSUED" ? "success" as const :
  s === "REJECTED" ? "danger" as const :
  s === "UNDER_EXAMINATION" ? "warning" as const :
  s === "SUBMITTED" ? "teal" as const : "muted" as const;

export default async function CertificatesPage() {
  await requireCapability("certificate:read");
  const [certificates, labs] = await Promise.all([
    prisma.certificate.findMany({
      orderBy: { createdAt: "desc" },
      include: { laboratory: true, gemstone: true },
    }),
    prisma.laboratory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { certificates: true } } } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-3"><Award className="h-7 w-7 text-sgs-purple-500" /> Certification</h1>
        <p className="text-sm text-muted-foreground">Every certificate submitted or received, across every stone.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total" value={String(certificates.length)} />
        <Stat label="Issued" value={String(certificates.filter(c => c.status === "ISSUED").length)} accent />
        <Stat label="In progress" value={String(certificates.filter(c => c.status === "SUBMITTED" || c.status === "UNDER_EXAMINATION").length)} />
        <Stat label="Laboratories" value={String(labs.length)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cert ID</TableHead>
                <TableHead>Gem</TableHead>
                <TableHead>Laboratory</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certificates.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">No certificates yet.</TableCell></TableRow>
              )}
              {certificates.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>
                    <Link href={`/gemstones/${c.gemstoneId}`} className="font-mono text-xs text-sgs-teal-700 hover:underline">{c.gemstone.code}</Link>
                  </TableCell>
                  <TableCell>{c.laboratory.name}</TableCell>
                  <TableCell className="text-xs">{c.certificateNumber ?? "—"}</TableCell>
                  <TableCell className="text-sm">{c.type}</TableCell>
                  <TableCell className="text-sm">{c.originDetermination ?? "—"}</TableCell>
                  <TableCell className="text-xs">{formatDate(c.submissionDate)}</TableCell>
                  <TableCell className="text-xs">{formatDate(c.issueDate)}</TableCell>
                  <TableCell><Badge variant={statusVariant(c.status)}>{c.status.replaceAll("_"," ")}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div>
        <h2 className="font-serif text-xl mb-3">Laboratories</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Certificates</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labs.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No laboratories registered.</TableCell></TableRow>
                )}
                {labs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.code}</TableCell>
                    <TableCell>{l.name}</TableCell>
                    <TableCell>{l.country ?? "—"}</TableCell>
                    <TableCell className="text-right">{l._count.certificates}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-serif text-2xl num mt-1 ${accent ? "text-sgs-purple-600" : ""}`}>{value}</div>
    </CardContent></Card>
  );
}
