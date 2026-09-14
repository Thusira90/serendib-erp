import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { matchingCustomersForGem } from "@/lib/matching";
import { Users2 } from "lucide-react";

export async function MatchingCustomersPanel({ gemstoneId }: { gemstoneId: string }) {
  const matches = await matchingCustomersForGem(gemstoneId, 10);

  if (matches.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No good customer matches yet.
          Add customer preferences under <span className="font-medium">Customers → Preferences</span> to enable smart matching.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Users2 className="h-4 w-4 text-sgs-teal-500" />
        Ranked by how closely their stated preferences fit this stone.
      </div>
      {matches.map(({ customer, match }) => (
        <Link key={customer.id} href={`/customers/${customer.id}`}>
          <Card className="hover:shadow-luxe-lg transition-shadow">
            <CardContent className="p-4 grid grid-cols-[1fr_auto] gap-4 items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{customer.displayName}</span>
                  <Badge variant="teal">{customer.type.replaceAll("_", " ")}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{customer.code}</span>
                </div>
                {customer.companyName && <div className="text-xs text-muted-foreground">{customer.companyName}</div>}
                <div className="text-xs text-muted-foreground mt-1">
                  {[customer.city, customer.country].filter(Boolean).join(", ") || "—"}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {match.matchedFacets.map((f) => (
                    <Badge key={f} variant="purple">{f}</Badge>
                  ))}
                </div>
                {match.reasons.length > 0 && (
                  <ul className="text-xs text-muted-foreground mt-2 list-disc pl-4 space-y-0.5">
                    {match.reasons.slice(0, 4).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
                {match.misses.length > 0 && (
                  <ul className="text-xs text-red-700/70 mt-1 list-disc pl-4 space-y-0.5">
                    {match.misses.slice(0, 3).map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                )}
              </div>
              <ScoreRing score={match.score} />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const size = 68, stroke = 6;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const dash = (pct / 100) * c;
  const color = score >= 80 ? "#501464" : score >= 60 ? "#2C5F6C" : "#64707A";
  return (
    <div className="grid place-items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#E5E4E0" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={c / 4} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
        <text x="50%" y="50%" textAnchor="middle" dy="0.35em" className="font-serif" style={{ fill: "#0F1414", fontSize: 20 }}>{score}</text>
      </svg>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground -mt-1">match</div>
    </div>
  );
}
