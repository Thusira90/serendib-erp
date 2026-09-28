"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Clock3, Copy, Check, MessageCircle, Mail, Link2, Users } from "lucide-react";
import { createShareLink } from "@/app/(app)/share-links/actions";

type Scope = "CATALOGUE" | "GEMSTONE" | "GEMSTONES" | "COLLECTION";

const TTL_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: "10 min", minutes: 10 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "6 hours", minutes: 360 },
  { label: "24 hours", minutes: 1440 },
];

/**
 * Generate a time-limited public share link — full catalogue, a curated
 * selection of stones, a single gemstone, or a Collection. Includes
 * optional broker mode so the recipient sees the broker's contact card
 * instead of the salesperson's.
 *
 * Pass `scope` + one of (gemstoneCode | gemstoneCodes | collectionShareCode)
 * to pre-fill the link's contents. `label` overrides the button text.
 */
export function TimedShareButton({
  scope,
  gemstoneCode,
  gemstoneCodes,
  collectionShareCode,
  label,
  sharerDefaults,
  size = "sm",
}: {
  scope: Scope;
  gemstoneCode?: string;
  gemstoneCodes?: string[];
  collectionShareCode?: string;
  label?: string;
  sharerDefaults?: { name?: string; phone?: string; email?: string };
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [ttlMinutes, setTtlMinutes] = useState<number>(60);
  const [customHours, setCustomHours] = useState<string>("");
  const [broker, setBroker] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState("Take a look at this — let me know what catches your eye.");

  const buttonLabel = label ?? (
    scope === "GEMSTONE" ? "Share stone with expiry"
    : scope === "COLLECTION" ? "Share collection with expiry"
    : scope === "GEMSTONES" ? "Share selection with expiry"
    : "Share catalogue with expiry"
  );

  function payloadJson(): string | null {
    if (scope === "GEMSTONE" && gemstoneCode) return JSON.stringify({ gemstoneCode });
    if (scope === "GEMSTONES" && gemstoneCodes?.length) return JSON.stringify({ gemstoneCodes });
    if (scope === "COLLECTION" && collectionShareCode) return JSON.stringify({ collectionShareCode });
    return null;
  }

  async function copyLink() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  function reset() {
    setGenerated(null);
    setCopied(false);
    setError(null);
    setBroker(false);
    setTtlMinutes(60);
    setCustomHours("");
  }

  const effectiveMinutes = customHours && Number(customHours) > 0
    ? Math.min(Math.round(Number(customHours) * 60), 60 * 24 * 30)
    : ttlMinutes;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size={size}>
          <Clock3 className="h-4 w-4" /> {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Link2 className="inline h-4 w-4 mr-2" />
            {generated ? "Share link generated" : "Create a time-limited share link"}
          </DialogTitle>
        </DialogHeader>

        {!generated ? (
          <form
            action={(fd) => start(async () => {
              setError(null);
              try {
                fd.set("scope", scope);
                fd.set("payload", payloadJson() ?? "");
                fd.set("ttlMinutes", String(effectiveMinutes));
                fd.set("message", msg);
                fd.set("brokerMode", broker ? "on" : "off");
                const { code } = await createShareLink(fd);
                const origin = typeof window !== "undefined" ? window.location.origin : "";
                setGenerated(`${origin}/s/${code}`);
              } catch (e) {
                setError((e as Error).message);
              }
            })}
            className="space-y-4"
          >
            <div className="rounded-md border bg-secondary/30 p-3 text-xs text-muted-foreground">
              You&apos;re sharing{" "}
              <span className="font-medium text-foreground">
                {scope === "GEMSTONE" && `stone ${gemstoneCode}`}
                {scope === "GEMSTONES" && `${gemstoneCodes?.length ?? 0} selected stones`}
                {scope === "COLLECTION" && "a curated collection"}
                {scope === "CATALOGUE" && "your full public catalogue"}
              </span>.
            </div>

            <div className="space-y-2">
              <Label>Link expires in</Label>
              <div className="flex flex-wrap gap-1.5">
                {TTL_PRESETS.map((p) => (
                  <button
                    key={p.minutes}
                    type="button"
                    onClick={() => { setTtlMinutes(p.minutes); setCustomHours(""); }}
                    className={`text-xs px-3 py-1.5 rounded-md border ${
                      !customHours && ttlMinutes === p.minutes
                        ? "bg-sgs-teal-500 text-white border-sgs-teal-500"
                        : "bg-background hover:bg-secondary"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-normal">Or custom hours:</Label>
                <Input
                  type="number"
                  min="0.1"
                  step="0.1"
                  max="720"
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                  placeholder="e.g. 12"
                  className="h-8 w-24 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">up to 720 h (30 d)</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Message to include</Label>
              <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} />
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-sgs-purple-500" />
                  <Label className="cursor-pointer">Broker mode</Label>
                </div>
                <input
                  type="checkbox"
                  checked={broker}
                  onChange={(e) => setBroker(e.target.checked)}
                  className="h-4 w-4"
                />
              </div>
              <div className="text-[10px] text-muted-foreground">
                Show the broker&apos;s contact card instead of yours on the public page. Useful when you want the broker to forward the link to their buyer without revealing your details.
              </div>
              {!broker && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <F label="Your name">
                    <Input name="createdByName" defaultValue={sharerDefaults?.name ?? ""} required />
                  </F>
                  <F label="WhatsApp">
                    <Input name="createdByPhone" defaultValue={sharerDefaults?.phone ?? ""} placeholder="+94 77…" />
                  </F>
                  <F label="Email" span>
                    <Input name="createdByEmail" defaultValue={sharerDefaults?.email ?? ""} type="email" />
                  </F>
                </div>
              )}
              {broker && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <input type="hidden" name="createdByName" value={sharerDefaults?.name ?? ""} />
                  <input type="hidden" name="createdByPhone" value={sharerDefaults?.phone ?? ""} />
                  <input type="hidden" name="createdByEmail" value={sharerDefaults?.email ?? ""} />
                  <F label="Broker name *">
                    <Input name="brokerName" required placeholder="Amir Perera" />
                  </F>
                  <F label="Broker company">
                    <Input name="brokerCompany" placeholder="Perera Gems" />
                  </F>
                  <F label="Broker WhatsApp">
                    <Input name="brokerPhone" placeholder="+94 77…" />
                  </F>
                  <F label="Broker email">
                    <Input name="brokerEmail" type="email" placeholder="amir@perera-gems.lk" />
                  </F>
                </div>
              )}
            </div>

            {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={pending}>
                {pending ? "Generating…" : `Generate link (expires in ${
                  effectiveMinutes < 60 ? `${effectiveMinutes} min`
                    : effectiveMinutes % 60 === 0 ? `${effectiveMinutes / 60} h`
                    : `${(effectiveMinutes / 60).toFixed(1)} h`
                })`}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border bg-emerald-50 border-emerald-500/30 p-3 text-xs">
              Link live for <span className="font-medium">{
                effectiveMinutes < 60 ? `${effectiveMinutes} min`
                  : effectiveMinutes % 60 === 0 ? `${effectiveMinutes / 60} h`
                  : `${(effectiveMinutes / 60).toFixed(1)} h`
              }</span> from now. After that it stops working.
            </div>
            <div className="flex items-center gap-1.5">
              <input
                readOnly
                value={generated}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 h-9 rounded border border-input bg-background px-2 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
              />
              <Button size="sm" variant="outline" onClick={copyLink}>
                {copied ? <><Check className="h-3.5 w-3.5 text-emerald-600" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  const text = `${msg}\n\n${generated}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                }}
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  const subject = "A gemstone selection for you";
                  const body = `${msg}\n\n${generated}`;
                  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                }}
              >
                <Mail className="h-4 w-4" /> Email
              </Button>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children, span = false }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={`space-y-1 ${span ? "col-span-2" : ""}`}>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
