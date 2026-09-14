"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sparkles, PlusCircle, Star } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { createCgiProject, addCgiVersion, markCgiMaster } from "../../cgi-actions";

type Version = {
  id: string; code: string; version: number; isMaster: boolean;
  approvedAt: Date | null; approvedBy: string | null;
  renderUrl: string | null; animationUrl: string | null;
  thumbnailUrl: string | null; modelUrl: string | null;
  notes: string | null; createdAt: Date;
};
type Project = {
  id: string; code: string; artist: string | null; software: string | null;
  softwareVersion: string | null; status: string; notes: string | null;
  createdAt: Date; versions: Version[];
};

export function CgiTab({
  gemstoneId, projects, canWrite,
}: {
  gemstoneId: string;
  projects: Project[];
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <NewProjectDialog gemstoneId={gemstoneId} />
        </div>
      )}

      {projects.length === 0 && (
        <div className="text-sm text-muted-foreground p-8 text-center border rounded-lg">
          No CGI projects yet. {canWrite && "Open one from the button above."}
        </div>
      )}

      {projects.map((p) => (
        <div key={p.id} className="rounded-lg border bg-card">
          <div className="p-4 flex items-start justify-between gap-4 border-b">
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-sgs-purple-500" />
                <span className="font-mono">{p.code}</span>
                <Badge variant="purple">{p.status.replaceAll("_", " ")}</Badge>
              </div>
              <div className="text-sm mt-1">
                {p.artist ?? "—"} · {p.software ?? "—"}{p.softwareVersion ? ` ${p.softwareVersion}` : ""}
              </div>
              {p.notes && <div className="text-xs text-muted-foreground mt-1">{p.notes}</div>}
            </div>
            {canWrite && <NewVersionDialog projectId={p.id} projectCode={p.code} />}
          </div>

          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {p.versions.length === 0 && (
              <div className="col-span-full text-sm text-muted-foreground">No versions uploaded yet.</div>
            )}
            {p.versions.map((v) => (
              <div key={v.id} className={`rounded-lg border overflow-hidden ${v.isMaster ? "ring-2 ring-sgs-purple-500 border-sgs-purple-300" : ""}`}>
                <div className="aspect-square bg-secondary/40 relative">
                  {v.thumbnailUrl || v.renderUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnailUrl ?? v.renderUrl ?? ""} alt={v.code} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full grid place-items-center text-xs text-muted-foreground">No preview</div>
                  )}
                  {v.isMaster && (
                    <div className="absolute top-2 left-2">
                      <Badge variant="purple"><Star className="h-3 w-3 mr-1" /> Master</Badge>
                    </div>
                  )}
                </div>
                <div className="p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{v.code}</span>
                    <span className="text-[10px] text-muted-foreground">{formatDateTime(v.createdAt)}</span>
                  </div>
                  {v.notes && <div className="text-xs text-muted-foreground line-clamp-2">{v.notes}</div>}
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {v.renderUrl && <Link href={v.renderUrl} target="_blank" className="text-sgs-teal-700 hover:underline">Render</Link>}
                    {v.animationUrl && <Link href={v.animationUrl} target="_blank" className="text-sgs-teal-700 hover:underline">360°</Link>}
                    {v.modelUrl && <Link href={v.modelUrl} target="_blank" className="text-sgs-teal-700 hover:underline">Model</Link>}
                  </div>
                  {canWrite && !v.isMaster && (
                    <form action={markCgiMaster}>
                      <input type="hidden" name="versionId" value={v.id} />
                      <Button size="sm" variant="outline" className="w-full mt-1">Mark master</Button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NewProjectDialog({ gemstoneId }: { gemstoneId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><PlusCircle className="h-4 w-4" /> Open CGI project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Open CGI project</DialogTitle></DialogHeader>
        <form action={(fd) => start(async () => { await createCgiProject(fd); setOpen(false); })} className="space-y-3">
          <input type="hidden" name="gemstoneId" value={gemstoneId} />
          <Field label="Artist"><Input name="artist" placeholder="Studio name / freelancer" /></Field>
          <Field label="Software"><Input name="software" placeholder="Blender" /></Field>
          <Field label="Software version"><Input name="softwareVersion" placeholder="4.2 LTS" /></Field>
          <Field label="Brief / notes"><Textarea name="notes" rows={3} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Create project"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewVersionDialog({ projectId, projectCode }: { projectId: string; projectCode: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Add version</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New version — {projectCode}</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => { await addCgiVersion(fd); setOpen(false); })}
          className="space-y-3"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Render (image)"><Input name="renderFile" type="file" accept="image/*" /></Field>
          <Field label="Thumbnail (optional)"><Input name="thumbnailFile" type="file" accept="image/*" /></Field>
          <Field label="360° animation (optional)"><Input name="animationFile" type="file" accept="video/*,image/gif" /></Field>
          <Field label="Model URL (external)"><Input name="modelUrl" placeholder="https://…" /></Field>
          <Field label="Notes"><Textarea name="notes" rows={2} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Uploading…" : "Add version"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
