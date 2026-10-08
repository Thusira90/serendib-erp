"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaUploadField } from "@/components/media-upload-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Camera, PlusCircle, Trash2 } from "lucide-react";
import { uploadPhoto, deleteDigitalAsset } from "@/app/(app)/gemstones/cgi-actions";
import { MEDIA_STAGES, MEDIA_STAGE_LABEL, type MediaStage } from "@/lib/enums";
import { isVideoAsset } from "@/lib/media";

export type MediaAsset = {
  id: string;
  kind: string;
  stage: string | null;
  url: string;
  caption: string | null;
  isPrimary: boolean;
  contentType: string | null;
  originalName: string | null;
  capturedAt: Date | null;
  createdAt: Date;
};

type Target =
  | { kind: "rough";   id: string }
  | { kind: "cutting"; id: string }
  | { kind: "gem";     id: string };

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ROUGH_PHOTO",       label: "Rough photo" },
  { value: "FINISHED_PHOTO",    label: "Finished photo" },
  { value: "MACRO_PHOTO",       label: "Macro photo" },
  { value: "INSPECTION_PHOTO",  label: "Inspection photo" },
  { value: "VIDEO",             label: "Video" },
  { value: "CATALOGUE_IMAGE",   label: "Catalogue image" },
  { value: "SOCIAL_ASSET",      label: "Social asset" },
  { value: "OTHER",             label: "Other" },
];

export function MediaGallery({
  target,
  assets,
  canWrite,
  defaultKind,
  defaultStage,
  title = "Media",
  helperText,
}: {
  target: Target;
  assets: MediaAsset[];
  canWrite: boolean;
  defaultKind: string;
  defaultStage: MediaStage;
  title?: string;
  helperText?: string;
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const stagesPresent = useMemo(() => {
    const s = new Set<string>();
    assets.forEach((a) => { if (a.stage) s.add(a.stage); });
    return Array.from(s);
  }, [assets]);
  const filtered = filter === "ALL" ? assets : assets.filter((a) => (a.stage ?? "") === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg">{title}</h3>
          {helperText && <p className="text-xs text-muted-foreground max-w-lg">{helperText}</p>}
        </div>
        {canWrite && (
          <UploadDialog target={target} defaultKind={defaultKind} defaultStage={defaultStage} />
        )}
      </div>

      {stagesPresent.length > 1 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}>All ({assets.length})</FilterChip>
          {MEDIA_STAGES.filter((s) => stagesPresent.includes(s)).map((s) => (
            <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
              {MEDIA_STAGE_LABEL[s]} ({assets.filter((a) => a.stage === s).length})
            </FilterChip>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-sm text-muted-foreground p-8 text-center border rounded-lg">
          {assets.length === 0
            ? "No media yet — upload a photo or video to start documenting."
            : "No media at this stage."}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((a) => (
          <AssetCard key={a.id} asset={a} canWrite={canWrite} />
        ))}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full border ${
        active
          ? "bg-sgs-teal-500 text-white border-sgs-teal-500"
          : "bg-secondary/40 text-foreground/80 hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function AssetCard({ asset, canWrite }: { asset: MediaAsset; canWrite: boolean }) {
  const [pending, start] = useTransition();
  const isVideo = isVideoAsset(asset);
  return (
    <div className={`rounded-lg border overflow-hidden ${asset.isPrimary ? "ring-2 ring-sgs-teal-500" : ""}`}>
      <div className="aspect-square bg-secondary/40">
        {isVideo ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={asset.url} className="h-full w-full object-cover" controls muted playsInline preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt={asset.caption ?? asset.kind} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between gap-1">
          {asset.stage
            ? <Badge variant="teal">{MEDIA_STAGE_LABEL[asset.stage as MediaStage] ?? asset.stage}</Badge>
            : <Badge variant="muted">{asset.kind.replaceAll("_", " ")}</Badge>}
          {asset.isPrimary && <Badge variant="purple">Primary</Badge>}
        </div>
        {asset.caption && <div className="text-xs text-muted-foreground line-clamp-2">{asset.caption}</div>}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <Link href={asset.url} target="_blank" className="text-sgs-teal-700 hover:underline">Open</Link>
          {canWrite && (
            <form
              action={(fd) => start(async () => { await deleteDigitalAsset(fd); })}
              onSubmit={(e) => { if (!confirm("Remove this asset?")) e.preventDefault(); }}
            >
              <input type="hidden" name="id" value={asset.id} />
              <button type="submit" disabled={pending} className="inline-flex items-center gap-0.5 hover:text-red-600 disabled:opacity-40">
                <Trash2 className="h-3 w-3" /> {pending ? "…" : "Delete"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadDialog({
  target, defaultKind, defaultStage,
}: {
  target: Target;
  defaultKind: string;
  defaultStage: MediaStage;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Each file goes up as its own request: one request carrying them all would hit the
  // form-size and serverless body limits as soon as a video is among them.
  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    start(async () => {
      setError(null);
      let done = 0;
      try {
        if (files.length === 0) {
          await uploadPhoto(fd);
        } else {
          for (const file of files) {
            setProgress({ done, total: files.length });
            const one = new FormData();
            for (const [key, value] of fd.entries()) if (key !== "file") one.append(key, value);
            one.set("file", file);
            if (done > 0) one.delete("isPrimary"); // only the first file can be the primary
            await uploadPhoto(one);
            done++;
          }
        }
        setOpen(false);
      } catch (e) {
        setError(files.length > 1 ? `${done} of ${files.length} uploaded. ${(e as Error).message}` : (e as Error).message);
      } finally {
        setProgress(null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm"><PlusCircle className="h-4 w-4" /> Upload media</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle><Camera className="inline h-4 w-4 mr-2" /> Upload photos or videos</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}
          className="space-y-3"
        >
          {target.kind === "gem"     && <input type="hidden" name="gemstoneId"   value={target.id} />}
          {target.kind === "rough"   && <input type="hidden" name="roughStoneId" value={target.id} />}
          {target.kind === "cutting" && <input type="hidden" name="cuttingJobId" value={target.id} />}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Stage *</Label>
              <select name="stage" defaultValue={defaultStage} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {MEDIA_STAGES.map((s) => (
                  <option key={s} value={s}>{MEDIA_STAGE_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <select name="kind" defaultValue={defaultKind} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Files (photos or videos, as many as you like)</Label>
            <MediaUploadField name="file" accept="image/*,video/*" buttonLabel="Upload photos or videos" />
          </div>
          <div className="space-y-1.5">
            <Label>…or external URL (one link)</Label>
            <Input name="url" placeholder="https://…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Captured on</Label>
              <Input name="capturedAt" type="date" />
              <div className="text-[10px] text-muted-foreground">When it was actually taken.</div>
            </div>
            <label className="flex items-end gap-2 text-sm pb-2">
              <input type="checkbox" name="isPrimary" />
              <span>Primary for this kind <span className="text-muted-foreground">(first file only)</span></span>
            </label>
          </div>
          <div className="space-y-1.5">
            <Label>Caption</Label>
            <Textarea name="caption" rows={2} placeholder="Day 3 — cabochon roughed out." />
          </div>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>
              {pending ? (progress && progress.total > 1 ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : "Uploading…") : "Upload"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
