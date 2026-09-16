"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LayoutGrid, Plus, Check } from "lucide-react";
import { addStoneToCollection } from "@/app/(app)/collections/actions";

type OpenCollection = { id: string; code: string; name: string; already: boolean };

export function AddToCollectionButton({
  gemstoneId,
  collections,
  defaultCurrency,
}: {
  gemstoneId: string;
  collections: OpenCollection[];
  defaultCurrency: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <LayoutGrid className="h-4 w-4 text-sgs-purple-500" /> Add to collection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add stone to a collection</DialogTitle></DialogHeader>
        {collections.length === 0 ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">No collections yet.</p>
            <Button asChild variant="accent" className="w-full">
              <Link href="/collections/new"><Plus className="h-4 w-4" /> Create the first collection</Link>
            </Button>
          </div>
        ) : (
          <form
            action={(fd) => start(async () => {
              setError(null);
              try {
                await addStoneToCollection(fd);
                setOpen(false);
              } catch (e) {
                setError((e as Error).message);
              }
            })}
            className="space-y-3"
          >
            <input type="hidden" name="gemstoneId" value={gemstoneId} />
            <div className="space-y-1.5">
              <Label>Collection</Label>
              <select
                name="collectionId"
                required
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="" disabled>— Pick a collection —</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.already}>
                    {c.code} · {c.name}{c.already ? "  (already added)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {!showAdvanced ? (
              <button
                type="button"
                onClick={() => setShowAdvanced(true)}
                className="text-xs text-sgs-teal-700 hover:underline"
              >
                + Add a note or price override for this stone
              </button>
            ) : (
              <div className="grid grid-cols-1 gap-3 border-t pt-3">
                <div className="space-y-1.5">
                  <Label>Note to customer (optional)</Label>
                  <Input name="note" placeholder="Perfect for your bridal request" />
                </div>
                <div className="space-y-1.5">
                  <Label>Price override (optional)</Label>
                  <CurrencyInput
                    amountName="priceOverride"
                    currencyName="currency"
                    defaultCurrency={defaultCurrency}
                    placeholder="Overrides list price on this collection only"
                  />
                </div>
              </div>
            )}

            {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}

            <div className="flex justify-between items-center gap-2 pt-2">
              <Link href="/collections/new" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> New collection
              </Link>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={pending}>{pending ? "Adding…" : <><Check className="h-4 w-4" /> Add</>}</Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
