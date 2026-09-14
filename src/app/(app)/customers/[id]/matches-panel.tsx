import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatCurrency } from "@/lib/utils";
import { matchingGemsForCustomer } from "@/lib/matching";
import { Gem } from "lucide-react";

export async function MatchingGemsPanel({ customerId }: { customerId: string }) {
  const matches = await matchingGemsForCustomer(customerId, 12);

  if (matches.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No inventory currently matches this customer's preferences.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {matches.map(({ gem, match }) => (
        <Link key={gem.id} href={`/gemstones/${gem.id}`}>
          <Card className="hover:shadow-luxe-lg transition-shadow overflow-hidden">
            <div className="flex">
              <div className="w-24 h-24 bg-sgs-gradient text-white grid place-items-center shrink-0">
                <Gem className="h-6 w-6 opacity-90" />
              </div>
              <CardContent className="p-3 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs">{gem.code}</div>
                    <div className="text-sm mt-0.5">{gem.gemType}{gem.variety ? ` · ${gem.variety}` : ""}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatCarat(Number(gem.weightCt))}{gem.origin ? ` · ${gem.origin}` : ""}
                      {gem.askingPrice ? ` · ${formatCurrency(Number(gem.askingPrice), gem.currency)}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-serif text-xl leading-none">{match.score}</div>
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">match</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {match.matchedFacets.slice(0, 5).map((f) => (
                    <Badge key={f} variant="purple">{f}</Badge>
                  ))}
                </div>
              </CardContent>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
