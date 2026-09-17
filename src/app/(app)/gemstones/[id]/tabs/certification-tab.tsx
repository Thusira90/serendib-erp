"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Award, FileText, Image as ImageIcon, PlusCircle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { createCertificate, createLaboratory, updateCertificateStatus } from "../../certification-actions";

type Lab = { id: string; code: string; name: string; country: string | null };
type Cert = {
  id: string; code: string; certificateNumber: string | null;
  type: string; status: string;
  laboratory: Lab;
  issueDate: Date | null; submissionDate: Date | null; returnDate: Date | null;
  originDetermination: string | null; treatmentDetermination: string | null;
  weightCt: number | null; colorGrade: string | null; comments: string | null;
  laboratoryFees: number | null; currency: string;
  documentUrl: string | null; imageUrl: string | null;
};

const statusVariant = (s: string) =>
  s === "ISSUED" ? "success" as const :
  s === "REJECTED" ? "danger" as const :
  s === "UNDER_EXAMINATION" ? "warning" as const :
  s === "SUBMITTED" ? "teal" as const : "muted" as const;

export function CertificationTab({
  gemstoneId, certificates, labs, canWrite,
}: {
  gemstoneId: string;
  certificates: Cert[];
  labs: Lab[];
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex gap-2 justify-end">
          <NewLabDialog />
          <NewCertificateDialog gemstoneId={gemstoneId} labs={labs} />
        </div>
      )}

      {certificates.length === 0 && (
        <div className="text-sm text-muted-foreground p-8 text-center border rounded-lg">
          No certificates yet. {canWrite && "Attach one using the button above."}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {certificates.map((c) => (
          <div key={c.id} className="border rounded-lg bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Award className="h-3.5 w-3.5 text-sgs-purple-500" />
                  <span className="font-mono">{c.code}</span>
                  <Badge variant={statusVariant(c.status)}>{c.status.replaceAll("_", " ")}</Badge>
                </div>
                <div className="font-serif text-lg mt-1">{c.laboratory.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.laboratory.country ?? "—"} · {c.type} {c.certificateNumber && `· #${c.certificateNumber}`}
                </div>
              </div>
              {canWrite && <StatusMenu id={c.id} current={c.status} />}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <KV label="Submitted" value={formatDate(c.submissionDate)} />
              <KV label="Issued" value={formatDate(c.issueDate)} />
              <KV label="Origin" value={c.originDetermination ?? "—"} />
              <KV label="Treatment" value={c.treatmentDetermination ?? "—"} />
              <KV label="Weight" value={c.weightCt ? `${Number(c.weightCt).toFixed(2)} ct` : "—"} />
              <KV label="Color grade" value={c.colorGrade ?? "—"} />
              <KV label="Lab fees" value={c.laboratoryFees ? formatCurrency(Number(c.laboratoryFees), c.currency) : "—"} />
            </div>

            {c.comments && (
              <div className="text-sm border-t pt-2 text-muted-foreground">{c.comments}</div>
            )}

            <div className="flex items-center gap-2 pt-1">
              {c.documentUrl && (
                <Link href={c.documentUrl} target="_blank" className="inline-flex items-center gap-1 text-xs text-sgs-teal-700 hover:underline">
                  <FileText className="h-3.5 w-3.5" /> Certificate PDF
                </Link>
              )}
              {c.imageUrl && (
                <Link href={c.imageUrl} target="_blank" className="inline-flex items-center gap-1 text-xs text-sgs-teal-700 hover:underline">
                  <ImageIcon className="h-3.5 w-3.5" /> Image
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function StatusMenu({ id, current }: { id: string; current: string }) {
  const [pending, start] = useTransition();
  return (
    <form action={(fd) => start(() => updateCertificateStatus(fd))} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <select name="status" defaultValue={current} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
        {["NOT_SUBMITTED","SUBMITTED","UNDER_EXAMINATION","ISSUED","REJECTED"].map(s => (
          <option key={s} value={s}>{s.replaceAll("_"," ")}</option>
        ))}
      </select>
      <Button size="sm" variant="outline" disabled={pending}>{pending ? "…" : "Save"}</Button>
    </form>
  );
}

function NewCertificateDialog({ gemstoneId, labs }: { gemstoneId: string; labs: Lab[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><PlusCircle className="h-4 w-4" /> Attach certificate</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Attach certificate</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => { await createCertificate(fd); setOpen(false); })}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <input type="hidden" name="gemstoneId" value={gemstoneId} />
          <Field label="Laboratory *" span>
            <select name="laboratoryId" required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Select —</option>
              {labs.map((l) => <option key={l.id} value={l.id}>{l.name}{l.country ? ` · ${l.country}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Certificate number"><Input name="certificateNumber" placeholder="17264-3921" /></Field>
          <Field label="Type">
            <select name="type" defaultValue="IDENTIFICATION" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="IDENTIFICATION">Identification</option>
              <option value="ORIGIN">Origin</option>
              <option value="QUALITY">Quality</option>
              <option value="APPRAISAL">Appraisal</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue="SUBMITTED" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="NOT_SUBMITTED">Not submitted</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_EXAMINATION">Under examination</option>
              <option value="ISSUED">Issued</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </Field>
          <Field label="Submission date"><Input name="submissionDate" type="date" /></Field>
          <Field label="Issue date"><Input name="issueDate" type="date" /></Field>
          <Field label="Origin determination"><Input name="originDetermination" placeholder="Sri Lanka (Ceylon)" /></Field>
          <Field label="Treatment determination"><Input name="treatmentDetermination" placeholder="No indications of heat" /></Field>
          <Field label="Weight (ct)"><Input name="weightCt" inputMode="decimal" /></Field>
          <Field label="Color grade"><Input name="colorGrade" placeholder="vivid blue" /></Field>
          <Field label="Lab fees"><Input name="laboratoryFees" inputMode="decimal" /></Field>
          <Field label="Currency"><Input name="currency" defaultValue="LKR" /></Field>
          <Field label="Comments" span><Textarea name="comments" rows={2} /></Field>
          <Field label="Certificate PDF (optional)"><Input name="documentFile" type="file" accept="application/pdf,image/*" /></Field>
          <Field label="Certificate image (optional)"><Input name="imageFile" type="file" accept="image/*" /></Field>
          <div className="col-span-full flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Save certificate"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewLabDialog() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">New laboratory</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add laboratory</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => { await createLaboratory(fd); setOpen(false); })}
          className="space-y-3"
        >
          <Field label="Code *"><Input name="code" required placeholder="GRS" /></Field>
          <Field label="Name *"><Input name="name" required placeholder="GRS Gemresearch Swisslab" /></Field>
          <Field label="Country"><Input name="country" placeholder="Switzerland" /></Field>
          <Field label="Website"><Input name="website" placeholder="https://gemresearch.ch" /></Field>
          <Field label="Notes"><Textarea name="notes" rows={2} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Add laboratory"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, span = false }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={`space-y-1.5 ${span ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
