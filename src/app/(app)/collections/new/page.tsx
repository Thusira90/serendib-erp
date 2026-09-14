import Link from "next/link";
import { requireCapability } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { createCollection } from "../actions";

export default async function NewCollectionPage() {
  await requireCapability("collection:write");
  const customers = await prisma.customer.findMany({
    orderBy: { displayName: "asc" },
    select: { id: true, code: true, displayName: true, companyName: true },
  });

  return (
    <div className="space-y-6">
      <Link href="/collections" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to collections
      </Link>

      <div>
        <h1 className="font-serif text-3xl flex items-center gap-3">
          <LayoutGrid className="h-7 w-7 text-sgs-purple-500" /> New collection
        </h1>
        <p className="text-sm text-muted-foreground">Start empty — add stones from any gemstone detail page after creating.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form action={createCollection} className="space-y-4 max-w-2xl">
            <F label="Name *"><Input name="name" required placeholder="Ceylon sapphire highlights for James Chen" /></F>
            <F label="Intro (shown to the customer at the top of the share page)">
              <Textarea name="intro" rows={3} placeholder="Handpicked from our latest arrivals from Ratnapura and Elahera — unheated, cornflower blue tones under 5ct." />
            </F>
            <div className="grid grid-cols-2 gap-4">
              <F label="For customer (optional)">
                <select name="customerId" defaultValue="" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— General / any customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}{c.companyName ? ` — ${c.companyName}` : ""} · {c.code}
                    </option>
                  ))}
                </select>
              </F>
              <F label="Expires on (optional)">
                <Input name="expiresAt" type="date" />
              </F>
            </div>
            <div className="text-xs text-muted-foreground border rounded-md p-3 bg-secondary/40">
              A short unambiguous share code is minted automatically. You&rsquo;ll see the shareable link on the next screen.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button asChild variant="outline"><Link href="/collections">Cancel</Link></Button>
              <Button>Create collection</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
