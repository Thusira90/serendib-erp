"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaUploadField } from "@/components/media-upload-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Receipt, ExternalLink } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { STONE_BILL_CATEGORIES } from "@/lib/enums";
import { addStoneBill } from "@/app/(app)/expenses/actions";

const label = (c: string) => c.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

export function AddBillButton({
  kind, stoneId, stoneCode, defaultCurrency = "LKR",
  suggestedCategory,
}: {
  kind: "rough" | "gemstone";
  stoneId: string;
  stoneCode: string;
  defaultCurrency?: string;
  /**
   * Category pre-selected on open (must be a stone-bill category, otherwise
   * the default is used). Transport is typical for a rough, professional fees
   * (cutting labour, certification) for a cut stone.
   */
  suggestedCategory?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const defaultCat = (STONE_BILL_CATEGORIES as readonly string[]).includes(suggestedCategory ?? "")
    ? suggestedCategory
    : kind === "rough" ? "SHIPPING" : "PROFESSIONAL_FEES";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Receipt className="h-4 w-4" /> Add bill
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Receipt className="inline h-4 w-4 mr-2" />
            File a bill for <span className="font-mono text-sm">{stoneCode}</span>
          </DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => start(async () => {
            setError(null);
            try { await addStoneBill(fd); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          })}
          className="grid grid-cols-2 gap-3"
        >
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="stoneId" value={stoneId} />

          <Field label="Category *">
            <select name="category" defaultValue={defaultCat} required
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {STONE_BILL_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </Field>
          <Field label="Bill date">
            <Input name="incurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </Field>

          <Field label="Amount *" span>
            <CurrencyInput
              amountName="amount"
              currencyName="currency"
              required
              defaultCurrency={defaultCurrency}
            />
          </Field>

          <Field label="Vendor / payee" span>
            <Input name="vendor" placeholder="Ranatunga Gem Cutters" />
          </Field>

          <Field label="Description *" span>
            <Input name="description" required placeholder="Cutting fee for {code}, invoice #452" />
          </Field>

          <Field label="Receipt or invoice (PDF or image)" span>
            <MediaUploadField name="receiptFile" accept="application/pdf,image/*" multiple={false} buttonLabel="Upload receipt" />
          </Field>

          <Field label="Notes" span>
            <Textarea name="notes" rows={2} />
          </Field>

          {error && (
            <div className="col-span-full text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="col-span-full text-[10px] text-muted-foreground bg-secondary/40 rounded p-2 leading-snug">
            Filing this bill will record an <span className="font-medium">Expense</span> on the ledger AND
            allocate the cost to this stone{kind === "gemstone" ? " (updating its true cost + margin instantly)" : " (it will flow into any finished gems that come from this rough)"}.
          </div>

          <div className="col-span-full flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Filing…" : "File bill"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Small inline link to view the underlying expense (useful when rendered
 * in a bills list — one click to the expenses ledger row).
 */
export function BillExpenseLink({ code }: { code: string }) {
  return (
    <Link
      href={`/expenses?code=${encodeURIComponent(code)}`}
      className="inline-flex items-center gap-0.5 text-sgs-teal-700 hover:underline"
    >
      {code} <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

function Field({ label, children, span = false }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={`space-y-1.5 ${span ? "col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
