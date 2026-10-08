"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntityPicker, type PickerOption } from "@/components/entity-picker";
import {
  COST_TYPES,
  CURRENCIES,
  EARN_ON,
  EXPENSE_CATEGORIES,
  PARTNER_CURRENCIES,
  PARTNER_SCOPES,
  PAYOUT_METHODS,
  type EarnOn,
  type PartnerScope,
  type PayoutMethod,
} from "@/lib/enums";
import { cn } from "@/lib/utils";
import type { PartnerVisibility } from "@/lib/partner-visibility";
import { quickCreatePartner } from "../../actions";
import { amendTerms, createDeal, updateDealDraft } from "../actions";
import {
  DEAL_HELP_LINES,
  DEFAULT_EXCLUDED_TYPES,
  EARN_ON_LABEL,
  EARN_ON_NOTE,
  LEGAL_NOTICE,
  METHOD_FORMULA,
  METHOD_LABEL,
  SCOPE_LABEL,
  SCOPE_NOTE,
  stoneRefParam,
  type DealInput,
  type StoneRef,
} from "../deal-shared";
import { VisibilityPanel } from "../[id]/visibility-editor";

export type DealFormMode = "create" | "edit" | "amend";

export interface DealFormInitial {
  partnerId: string;
  title: string;
  partnerTitle: string;
  method: PayoutMethod;
  scope: PartnerScope;
  earnOn: EarnOn;
  currency: string;
  ratePct: string;
  fixedFee: string;
  invested: string;
  capitalProtected: boolean;
  excludedCostTypes: string[];
  rates: { ccy: string; rate: string }[];
  visibility: PartnerVisibility;
  partnerNote: string;
  internalNotes: string;
}

const METHOD_RATE_LABEL: Record<PayoutMethod, string> = {
  PROFIT_SHARE: "Partner's share of the profit (%)",
  SALE_COMMISSION: "Commission on the sale price (%)",
  FIXED_FEE: "",
  INVESTMENT: "Partner's share of the profit (%), on top of their capital",
};

/** Cost types a deal can leave out. The rough's own purchase price can never be excluded. */
const EXCLUDABLE_TYPES: string[] = [...new Set<string>([...COST_TYPES, ...EXPENSE_CATEGORIES])].filter((t) => t !== "ROUGH_PURCHASE").sort();
const typeLabel = (t: string): string => t.charAt(0) + t.slice(1).toLowerCase().replaceAll("_", " ");
const currencyName = (code: string): string => CURRENCIES.find((c) => c.code === code)?.name ?? code;

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RadioCard({
  name, value, checked, onChange, title, children,
}: { name: string; value: string; checked: boolean; onChange: () => void; title: string; children: React.ReactNode }) {
  return (
    <label className="relative block cursor-pointer">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="peer sr-only" />
      <div className="h-full rounded-lg border bg-background p-3 text-sm transition-colors hover:bg-secondary/40 peer-checked:border-sgs-teal-500 peer-checked:bg-sgs-teal-100/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{children}</div>
      </div>
    </label>
  );
}

export function DealForm({
  mode,
  dealId,
  dealCode,
  partners,
  partnerName,
  initial,
  addStone,
  ratesFrozen = false,
  cancelHref,
}: {
  mode: DealFormMode;
  dealId?: string;
  dealCode?: string;
  partners: PickerOption[];
  /** Amend mode shows the partner as text; it cannot change once a deal is active. */
  partnerName?: string;
  initial: DealFormInitial;
  /** Create mode: a stone to put in the picker on the Stones tab right after saving. */
  addStone?: (StoneRef & { code: string }) | null;
  ratesFrozen?: boolean;
  cancelHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial.title);
  const [partnerTitle, setPartnerTitle] = useState(initial.partnerTitle);
  const [method, setMethod] = useState<PayoutMethod>(initial.method);
  const [scope, setScope] = useState<PartnerScope>(initial.scope);
  const [earnOn, setEarnOn] = useState<EarnOn>(initial.earnOn);
  const [currency, setCurrency] = useState(initial.currency);
  const [ratePct, setRatePct] = useState(initial.ratePct);
  const [fixedFee, setFixedFee] = useState(initial.fixedFee);
  const [invested, setInvested] = useState(initial.invested);
  const [capitalProtected, setCapitalProtected] = useState(initial.capitalProtected);
  const [excluded, setExcluded] = useState<Set<string>>(new Set(initial.excludedCostTypes));
  const [rates, setRates] = useState(initial.rates);
  const [rateToAdd, setRateToAdd] = useState("");
  const [visibility, setVisibility] = useState<PartnerVisibility>(initial.visibility);
  const [partnerNote, setPartnerNote] = useState(initial.partnerNote);
  const [internalNotes, setInternalNotes] = useState(initial.internalNotes);
  const [reason, setReason] = useState("");

  const strong = method === "INVESTMENT" || method === "PROFIT_SHARE";
  const addableRates = PARTNER_CURRENCIES.filter((c) => c !== "LKR" && !rates.some((r) => r.ccy === c));

  function changeMethod(next: PayoutMethod) {
    setMethod(next);
    if (next === "FIXED_FEE") setRatePct("");
    else setFixedFee("");
    if (next !== "INVESTMENT") {
      setInvested("");
      setCapitalProtected(false);
    }
  }

  function toggleExcluded(t: string, on: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (on) next.add(t);
      else next.delete(t);
      return next;
    });
  }

  function addRate() {
    if (!rateToAdd) return;
    setRates((r) => [...r, { ccy: rateToAdd, rate: "" }]);
    setRateToAdd("");
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const partnerId = mode === "amend" ? initial.partnerId : String(fd.get("partnerId") ?? "");
    if (!partnerId) {
      setError("Choose a partner for the deal.");
      return;
    }
    if (mode === "amend" && reason.trim() === "") {
      setError("Say why the terms are being amended.");
      return;
    }
    const input: DealInput = {
      partnerId,
      title: title.trim(),
      partnerTitle: partnerTitle.trim() || null,
      method,
      scope,
      earnOn,
      currency,
      ratePct: method === "FIXED_FEE" ? null : ratePct.trim() || null,
      fixedFee: method === "FIXED_FEE" ? fixedFee.trim() || null : null,
      invested: method === "INVESTMENT" ? invested.trim() || null : null,
      capitalProtected: method === "INVESTMENT" ? capitalProtected : false,
      excludedCostTypes: [...excluded],
      rates: Object.fromEntries(rates.filter((r) => r.rate.trim() !== "").map((r) => [r.ccy, r.rate.trim()])),
      visibility,
      partnerNote: partnerNote.trim() || null,
      internalNotes: internalNotes.trim() || null,
    };
    start(async () => {
      if (mode === "create") {
        const r = await createDeal(input);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        router.push(`/partners/deals/${r.id}?tab=stones${addStone ? `&add=${stoneRefParam(addStone)}` : ""}`);
        return;
      }
      const r = mode === "amend" ? await amendTerms({ dealId: dealId ?? "", input, reason: reason.trim() }) : await updateDealDraft({ dealId: dealId ?? "", input });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/partners/deals/${dealId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div
        role="note"
        className={cn(
          "flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900",
          strong && "border-2 border-amber-400 p-4",
        )}
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="space-y-1">
          {strong && <p className="font-semibold">Legal and tax notice</p>}
          <p className={strong ? "" : "text-xs"}>{LEGAL_NOTICE}</p>
        </div>
      </div>

      {mode === "amend" && (
        <div role="note" className="rounded-lg border border-sgs-purple-200 bg-sgs-purple-50 p-3 text-sm text-sgs-purple-900">
          <p className="font-medium">Amending the terms of {dealCode}</p>
          <p className="mt-0.5 text-xs">
            Terms can only be amended while there is no settlement, adjustment or payout. The partner will see &quot;Terms last amended on&quot; the date you save. After the first
            settlement the terms are frozen: close the deal and create a new one.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>The deal</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Partner *">
            {mode === "amend" ? (
              <div className="flex h-9 items-center rounded-md border bg-secondary/40 px-3 text-sm">{partnerName}</div>
            ) : (
              <EntityPicker
                name="partnerId"
                emptyLabel="Choose a partner"
                options={partners}
                defaultValue={initial.partnerId}
                createLabel="Add partner"
                createPlaceholder="Partner name"
                onQuickCreate={async (name) => {
                  const p = await quickCreatePartner(name);
                  return { id: p.id, label: p.name, hint: p.code };
                }}
              />
            )}
          </Field>
          <Field label="Internal title *" htmlFor="deal-title" hint="Only your team sees this.">
            <Input id="deal-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="Hassan, Mogok parcel, spring" />
          </Field>
          <Field label="Title the partner sees" htmlFor="deal-partner-title" hint="Leave empty to show &quot;Your deal&quot;.">
            <Input id="deal-partner-title" value={partnerTitle} onChange={(e) => setPartnerTitle(e.target.value)} maxLength={120} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How the partner is paid</CardTitle>
          <CardDescription>Pick one. Changing it clears the fields that belong to the others.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Payout method">
            {PAYOUT_METHODS.map((m) => (
              <RadioCard key={m} name="method" value={m} checked={method === m} onChange={() => changeMethod(m)} title={METHOD_LABEL[m]}>
                {METHOD_FORMULA[m]}
              </RadioCard>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {method !== "FIXED_FEE" && (
              <Field label={METHOD_RATE_LABEL[method]} htmlFor="deal-rate" hint="Up to two decimal places, for example 12.5.">
                <Input id="deal-rate" inputMode="decimal" value={ratePct} onChange={(e) => setRatePct(e.target.value)} placeholder="10" required />
              </Field>
            )}
            {method === "FIXED_FEE" && (
              <Field
                label={`Fixed fee (${currency}) ${scope === "PER_STONE" ? "per stone" : "for the whole lot"}`}
                htmlFor="deal-fee"
                hint={scope === "PER_STONE" ? "Scaled by how much of each stone has sold." : "Paid once, scaled by how much of the lot has sold."}
              >
                <Input id="deal-fee" inputMode="decimal" value={fixedFee} onChange={(e) => setFixedFee(e.target.value)} placeholder="50000" required />
              </Field>
            )}
            {method === "INVESTMENT" && (
              <>
                <Field label={`Amount invested (${currency})`} htmlFor="deal-invested" hint="The partner's capital across all stones in the deal. You split it per stone on the Stones tab.">
                  <Input id="deal-invested" inputMode="decimal" value={invested} onChange={(e) => setInvested(e.target.value)} placeholder="1000000" required />
                </Field>
                <div className="sm:col-span-2">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" checked={capitalProtected} onChange={(e) => setCapitalProtected(e.target.checked)} className="mt-0.5 h-4 w-4" />
                    <span>
                      <span className="font-medium">Return capital first on a loss</span>
                      <span className="block text-xs text-muted-foreground">
                        Off (default): a loss is shared, so the partner gets back a proportional part of their capital. On: their capital comes back first, and the company bears the shortfall.
                      </span>
                    </span>
                  </label>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How it is worked out</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Scope *</Label>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Scope">
              {PARTNER_SCOPES.map((s) => (
                <RadioCard key={s} name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} title={SCOPE_LABEL[s]}>
                  {SCOPE_NOTE[s]}
                </RadioCard>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Partner earns *</Label>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Earn on">
              {[...EARN_ON].reverse().map((e) => (
                <RadioCard key={e} name="earnOn" value={e} checked={earnOn === e} onChange={() => setEarnOn(e)} title={EARN_ON_LABEL[e]}>
                  {EARN_ON_NOTE[e]}
                </RadioCard>
              ))}
            </div>
          </div>
          <Field label="Deal currency *" htmlFor="deal-currency" hint="Every amount on this deal is kept in this currency.">
            <select
              id="deal-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
            >
              {PARTNER_CURRENCIES.map((c) => <option key={c} value={c}>{c} - {currencyName(c)}</option>)}
            </select>
          </Field>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {DEAL_HELP_LINES.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Costs and exchange rates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Costs never charged to the partner</Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {EXCLUDABLE_TYPES.map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={excluded.has(t)} onChange={(e) => toggleExcluded(t, e.target.checked)} className="h-4 w-4" />
                  {typeLabel(t)}
                  {DEFAULT_EXCLUDED_TYPES.includes(t) && <span className="text-[10px] text-muted-foreground">(default)</span>}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Overheads like rent, salaries and tax are left out by default. The stone&apos;s own purchase price is always counted.</p>
          </div>

          <div className="space-y-2">
            <Label>Manual exchange rates</Label>
            {ratesFrozen ? (
              <p className="rounded border bg-secondary/40 p-2 text-xs text-muted-foreground">Frozen: the rates were written onto the deal at its first settlement. Change them with Revalue rates on the Money tab.</p>
            ) : (
              <>
                {rates.length === 0 && <p className="text-xs text-muted-foreground">None. The live rate is used. Add a manual rate to fix a figure.</p>}
                <div className="space-y-2">
                  {rates.map((r, i) => (
                    <div key={r.ccy} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-16">1 {r.ccy} =</span>
                      <Input
                        aria-label={`Rate for ${r.ccy}`}
                        inputMode="decimal"
                        className="w-32"
                        value={r.rate}
                        placeholder="330.50"
                        onChange={(e) => setRates((all) => all.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))}
                      />
                      <span>LKR</span>
                      <button
                        type="button"
                        aria-label={`Remove the ${r.ccy} rate`}
                        onClick={() => setRates((all) => all.filter((_, j) => j !== i))}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Currency to add a rate for"
                    value={rateToAdd}
                    onChange={(e) => setRateToAdd(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">Add a rate for...</option>
                    {addableRates.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Button type="button" size="sm" variant="outline" onClick={addRate} disabled={!rateToAdd}>
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">A manual rate (LKR for one unit) is used for every conversion on this deal. All rates in use are frozen onto the deal at its first settlement.</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {mode === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle>What the partner sees</CardTitle>
            <CardDescription>You can change this any time on the Visibility tab, with a live preview.</CardDescription>
          </CardHeader>
          <CardContent>
            <VisibilityPanel value={visibility} onChange={setVisibility} method={method} earnOn={earnOn} />
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-lg border bg-secondary/30 p-3 text-xs text-muted-foreground">What the partner sees is changed on the Visibility tab of the deal.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Note to the partner" htmlFor="deal-partner-note" hint={`${partnerNote.length}/500. Shown on their page.`}>
            <Textarea id="deal-partner-note" rows={4} maxLength={500} value={partnerNote} onChange={(e) => setPartnerNote(e.target.value)} />
          </Field>
          <Field label="Internal notes" htmlFor="deal-internal-notes" hint="Never shown to the partner.">
            <Textarea id="deal-internal-notes" rows={4} maxLength={2000} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {mode === "amend" && (
        <Card>
          <CardContent className="p-5">
            <Field label="Why are the terms being amended? *" htmlFor="deal-reason" hint="Kept in the audit log. Never shown to the partner.">
              <Textarea id="deal-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} required />
            </Field>
          </CardContent>
        </Card>
      )}

      {error && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {addStone && mode === "create" && (
        <p className="text-xs text-muted-foreground">
          After saving you land on the Stones tab with <span className="font-mono">{addStone.code}</span> ready to add.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline"><Link href={cancelHref}>Cancel</Link></Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : mode === "create" ? "Create draft deal" : mode === "amend" ? "Amend terms" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
