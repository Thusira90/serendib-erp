"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Info, Lock, Monitor, Smartphone, Sparkles, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EarnOn, PayoutMethod } from "@/lib/enums";
import type { PartnerPortalDto } from "@/lib/partner-dto";
import {
  VISIBILITY_KEYS,
  VISIBILITY_LABELS,
  calculationVisible,
  defaultVisibilityForKind,
  disclosureWarnings,
  explainable,
  normalizeVisibility,
  presetOf,
  presetVisibility,
  visibilityLocks,
  type PartnerVisibility,
  type VisibilityKey,
  type VisibilityPreset,
} from "@/lib/partner-visibility";
import { PartnerPortalView } from "@/components/partner-portal/portal-view";
import { previewVisibility, saveVisibility } from "../actions";

const GROUPS: { title: string; keys: VisibilityKey[] }[] = [
  { title: "Stone details", keys: ["stoneIdentity", "stoneSpecs", "provenance", "timeline", "cgi", "certificates"] },
  { title: "Photos and documents", keys: ["media", "processMedia", "mediaCaptions", "certificateFiles", "receipts"] },
  { title: "Prices and payments", keys: ["askingPrice", "salePrice", "paymentsReceived"] },
  { title: "Costs, supplier and profit", keys: ["purchaseCost", "costBreakdown", "supplierIdentity", "profitFigures", "calculationDetail"] },
];

const HELP: Record<VisibilityKey, string> = {
  stoneIdentity: "Internal stone codes. Off shows Stone A, Stone B.",
  stoneSpecs: "Type, variety, weight, size, colour, clarity, treatment and origin.",
  provenance: "The rough to cutting to gem chain and the acquisition date.",
  timeline: "An activity feed of approved event types.",
  media: "Approved photos and videos.",
  processMedia: "Photos and videos from the cutting jobs.",
  mediaCaptions: "Free-text captions on photos and videos.",
  cgi: "The CGI score and band.",
  certificates: "Lab, certificate number, status and issue date.",
  certificateFiles: "The certificate documents themselves.",
  askingPrice: "The list price of unsold stones.",
  salePrice: "The agreed sale price, without tax.",
  paymentsReceived: "How much the buyer has paid, and when.",
  purchaseCost: "What the stone cost to acquire.",
  costBreakdown: "Other costs, grouped by category.",
  receipts: "Bill receipts, as documents.",
  supplierIdentity: "The supplier's name.",
  profitFigures: "Revenue, cost and profit per stone.",
  calculationDetail: "The step-by-step account of how their amount was worked out.",
};

/** What turning each risky switch on exposes; shown in the confirmation. */
const RISK: Partial<Record<VisibilityKey, string>> = {
  supplierIdentity: "The supplier's name appears on every stone.",
  receipts: "Bill receipts can be opened as documents. They normally name the vendor and show prices.",
  certificateFiles: "Certificate documents can be opened. They are already public through the verify page.",
  mediaCaptions: "Free-text captions are shown. They may contain names or prices.",
};
const RISKY: readonly VisibilityKey[] = ["supplierIdentity", "receipts", "certificateFiles", "mediaCaptions"];
const DEPENDENT: readonly VisibilityKey[] = ["receipts", "certificateFiles", "mediaCaptions"];

const PRESET_BUTTONS: { key: VisibilityPreset | "INVESTOR"; label: string; hint: string }[] = [
  { key: "FULL", label: "Full", hint: "Everything, including supplier name, receipts and certificate documents." },
  { key: "STANDARD", label: "Standard", hint: "Stone details, prices, costs and profit. No supplier name, receipts or documents." },
  { key: "MINIMAL", label: "Minimal", hint: "Stone specifications, photos and certificates only. No prices or costs." },
  { key: "INVESTOR", label: "Investor default", hint: "Full, without the supplier name, receipts and certificate documents." },
];

function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-sgs-teal-500" : "bg-input",
      )}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

interface PendingChange {
  next: PartnerVisibility;
  newlyVisible: VisibilityKey[];
  typedWord: string | null;
}

/** Presets, grouped switches with their locks, warnings and the "can they reproduce their amount" line. Controlled. */
export function VisibilityPanel({
  value,
  onChange,
  method,
  earnOn,
  disabled = false,
}: {
  value: PartnerVisibility;
  onChange: (v: PartnerVisibility) => void;
  method: PayoutMethod;
  earnOn: EarnOn;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [typed, setTyped] = useState("");
  const locks = useMemo(() => visibilityLocks(value, method, earnOn), [value, method, earnOn]);
  const warnings = useMemo(() => disclosureWarnings(value, method, earnOn), [value, method, earnOn]);
  const effective = useMemo(() => normalizeVisibility(value, method, earnOn).effective, [value, method, earnOn]);
  const reproduces = explainable(method, value, earnOn);
  const showsCalculation = calculationVisible(method, value, earnOn);
  const preset = presetOf(value);

  // Dependent switches (receipts, documents, captions) are cleared when their base goes dark, so they cannot reappear later.
  const clean = (v: PartnerVisibility): PartnerVisibility => {
    const eff = normalizeVisibility(v, method, earnOn).effective;
    const out = { ...v };
    for (const k of DEPENDENT) if (out[k] && !eff[k]) out[k] = false;
    return out;
  };

  function request(raw: PartnerVisibility) {
    const next = clean(raw);
    const before = effective;
    const after = normalizeVisibility(next, method, earnOn).effective;
    const newlyVisible = VISIBILITY_KEYS.filter((k) => after[k] && !before[k]);
    const risky = RISKY.some((k) => next[k] && !value[k]);
    if (!risky) {
      onChange(next);
      return;
    }
    const typedWord = next.receipts && !value.receipts && !after.supplierIdentity ? "receipts" : null;
    setTyped("");
    setPending({ next, newlyVisible, typedWord });
  }

  const confirmReady = pending !== null && (pending.typedWord === null || typed.trim().toLowerCase() === pending.typedWord);

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-md border bg-secondary/30 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Presets. One click sets every switch.
          <Badge variant={preset === "CUSTOM" ? "muted" : "teal"}>{preset === "CUSTOM" ? "Custom" : preset.charAt(0) + preset.slice(1).toLowerCase()}</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_BUTTONS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={disabled}
              title={p.hint}
              onClick={() => request(p.key === "INVESTOR" ? defaultVisibilityForKind("INVESTOR") : presetVisibility(p.key))}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-xs hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{group.title}</div>
          <div className="space-y-1">
            {group.keys.map((k) => {
              const lockOn = locks.forcedOn[k];
              const lockOff = locks.forcedOff[k];
              const locked = lockOn !== undefined || lockOff !== undefined;
              const checked = lockOn !== undefined ? true : lockOff !== undefined ? false : value[k];
              return (
                <div
                  key={k}
                  className={cn("flex items-start gap-3 rounded-md border px-3 py-2", checked ? "border-emerald-500/30 bg-emerald-50/50" : "bg-background")}
                >
                  <Switch checked={checked} disabled={disabled || locked} label={VISIBILITY_LABELS[k]} onChange={(on) => request({ ...value, [k]: on })} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{VISIBILITY_LABELS[k]}</div>
                    <div className="text-xs text-muted-foreground">{HELP[k]}</div>
                    {locked && (
                      <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-800">
                        <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        <span>
                          {lockOn !== undefined ? "Always on. " : "Not available. "}
                          {lockOn ?? lockOff}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div
        className={cn(
          "flex items-start gap-2 rounded-md border p-3 text-xs",
          reproduces && showsCalculation ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "bg-secondary/40 text-muted-foreground",
        )}
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {reproduces
            ? showsCalculation
              ? "The partner can reproduce their amount: every figure in the calculation is visible."
              : "The partner could reproduce their amount from what is visible, but the step-by-step calculation is switched off, so they see the result only."
            : "The partner cannot reproduce their amount from what is visible. They see \"Calculated per the agreed terms\" plus the result."}
        </span>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="flex items-center gap-1.5 font-medium">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Worth knowing
          </div>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Show more to the partner?</DialogTitle>
            <DialogDescription>This is what becomes visible on their page.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {(pending?.newlyVisible ?? []).map((k) => (
              <li key={k}>
                <span className="font-medium">{VISIBILITY_LABELS[k]}.</span> <span className="text-muted-foreground">{RISK[k] ?? HELP[k]}</span>
              </li>
            ))}
            {(pending?.newlyVisible.length ?? 0) === 0 && <li className="text-muted-foreground">Nothing new is shown right now, but the switch stays on if the rules change later.</li>}
          </ul>
          {pending?.typedWord && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Receipts normally name the vendor and the supplier name is hidden. Type <span className="font-mono font-medium">{pending.typedWord}</span> to confirm.
              </p>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label="Type the word to confirm" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button
              type="button"
              disabled={!confirmReady}
              onClick={() => {
                if (pending) onChange(pending.next);
                setPending(null);
              }}
            >
              Show this to the partner
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type PreviewWidth = "desktop" | "phone";

/** The Visibility tab: switches on the left, the partner page as it would look right now on the right. */
export function VisibilityEditor({
  dealId,
  method,
  earnOn,
  initial,
  canWrite,
}: {
  dealId: string;
  method: PayoutMethod;
  earnOn: EarnOn;
  initial: PartnerVisibility;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<PartnerVisibility>(initial);
  const [saved, setSaved] = useState<PartnerVisibility>(initial);
  const [saving, startSave] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [dto, setDto] = useState<PartnerPortalDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [width, setWidth] = useState<PreviewWidth>("desktop");
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  const dirty = VISIBILITY_KEYS.some((k) => value[k] !== saved[k]);
  const json = useMemo(() => JSON.stringify(value), [value]);

  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(() => {
      startPreview(async () => {
        const r = await previewVisibility(dealId, json);
        if (mine !== seq.current) return;
        if (r.ok) {
          setDto(r.dto);
          setPreviewError(null);
        } else {
          setPreviewError(r.error);
        }
      });
    }, 500);
    return () => clearTimeout(t);
  }, [dealId, json, nonce]);

  function save() {
    setMessage(null);
    startSave(async () => {
      const r = await saveVisibility({ dealId, visibility: value });
      if (!r.ok) {
        setMessage({ kind: "error", text: r.error });
        return;
      }
      setSaved(value);
      setMessage({ kind: "ok", text: "Saved. The partner sees this the next time they open their link." });
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={save} disabled={!canWrite || !dirty || saving}>
            {saving ? "Saving..." : "Save visibility"}
          </Button>
          {dirty && <span className="text-xs text-amber-800">Unsaved changes. The preview already shows them.</span>}
          {!canWrite && <span className="text-xs text-muted-foreground">You can view these settings but not change them.</span>}
        </div>
        {message && (
          <div
            role={message.kind === "error" ? "alert" : "status"}
            className={cn(
              "flex items-start gap-1.5 rounded border px-2 py-1.5 text-xs",
              message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800",
            )}
          >
            {message.kind === "ok" && <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />}
            {message.text}
          </div>
        )}
        <VisibilityPanel value={value} onChange={setValue} method={method} earnOn={earnOn} disabled={!canWrite} />
      </div>

      <div className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Eye className="h-4 w-4" aria-hidden /> Live preview
            {previewing && <span className="text-xs font-normal text-muted-foreground">updating...</span>}
          </div>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Preview width" className="inline-flex rounded-md border bg-background p-0.5">
              {([
                ["desktop", "Desktop", Monitor],
                ["phone", "Phone", Smartphone],
              ] as const).map(([w, label, Icon]) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={width === w}
                  onClick={() => setWidth(w)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium",
                    width === w ? "bg-sgs-teal-500 text-white" : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden /> {label}
                </button>
              ))}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setNonce((n) => n + 1)} disabled={previewing}>Refresh</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Exactly what the partner would see with these switches. Not logged, not counted.</p>
        {previewError && (
          <div role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{previewError}</div>
        )}
        {dto ? (
          <div className={cn("mx-auto max-h-[80vh] w-full overflow-auto rounded-lg border bg-sgs-bone shadow-luxe", width === "phone" ? "max-w-[390px]" : "max-w-full", previewing && "opacity-70")}>
            <PartnerPortalView dto={dto} mode="preview" docBase={`/partners/deals/${dealId}/preview/doc`} />
          </div>
        ) : (
          !previewError && <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Building the preview...</div>
        )}
      </div>
    </div>
  );
}
