import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Star } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export default async function CgiPage() {
  await requireCapability("cgi:read");
  const projects = await prisma.cGIProject.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      gemstone: true,
      versions: { orderBy: { version: "asc" } },
    },
  });

  const totalVersions = projects.reduce((s, p) => s + p.versions.length, 0);
  const withMaster = projects.filter((p) => p.versions.some((v) => v.isMaster)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-3"><Sparkles className="h-7 w-7 text-sgs-purple-500" /> CGI &amp; Digital Assets</h1>
        <p className="text-sm text-muted-foreground">Every render, every version — with one approved master per stone.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Projects" value={String(projects.length)} />
        <Stat label="Versions" value={String(totalVersions)} />
        <Stat label="With master" value={String(withMaster)} accent />
        <Stat label="Awaiting approval" value={String(projects.length - withMaster)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {projects.length === 0 && (
          <div className="col-span-full text-sm text-muted-foreground p-8 text-center border rounded-lg">
            No CGI projects yet.
          </div>
        )}
        {projects.map((p) => {
          const master = p.versions.find((v) => v.isMaster);
          const preview = master?.thumbnailUrl ?? master?.renderUrl ?? p.versions.at(-1)?.thumbnailUrl ?? p.versions.at(-1)?.renderUrl;
          return (
            <Link key={p.id} href={`/gemstones/${p.gemstoneId}`}>
              <Card className="hover:shadow-luxe-lg transition-shadow overflow-hidden">
                <div className="flex">
                  <div className="w-40 h-40 bg-secondary/40 shrink-0">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt={p.code} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full grid place-items-center text-xs text-muted-foreground">No preview</div>
                    )}
                  </div>
                  <CardContent className="p-4 flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{p.code}</span>
                      <Badge variant="purple">{p.status.replaceAll("_", " ")}</Badge>
                    </div>
                    <div className="font-serif text-lg">{p.gemstone.gemType}{p.gemstone.variety ? ` · ${p.gemstone.variety}` : ""}</div>
                    <div className="text-xs text-muted-foreground font-mono">{p.gemstone.code}</div>
                    <div className="text-sm">{p.artist ?? "—"} · {p.software ?? "—"}</div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="muted">{p.versions.length} versions</Badge>
                      {master && <Badge variant="purple"><Star className="h-3 w-3 mr-1" /> {master.code}</Badge>}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{formatDateTime(p.createdAt)}</div>
                  </CardContent>
                </div>
              </Card>
            </Link>
          );
        })}
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
