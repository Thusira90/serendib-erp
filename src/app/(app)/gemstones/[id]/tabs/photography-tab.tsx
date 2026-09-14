"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Camera, PlusCircle } from "lucide-react";
import { uploadPhoto } from "../../cgi-actions";

type Asset = {
  id: string; kind: string; url: string; caption: string | null;
  isPrimary: boolean; contentType: string | null; originalName: string | null;
  createdAt: Date;
};

export function PhotographyTab({
  gemstoneId, assets, canWrite,
}: {
  gemstoneId: string;
  assets: Asset[];
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <UploadDialog gemstoneId={gemstoneId} />
        </div>
      )}
      {assets.length === 0 && (
        <div className="text-sm text-muted-foreground p-8 text-center border rounded-lg">
          No photography or media yet.
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {assets.map((a) => (
          <div key={a.id} className={`rounded-lg border overflow-hidden ${a.isPrimary ? "ring-2 ring-sgs-teal-500" : ""}`}>
            <div className="aspect-square bg-secondary/40">
              {a.contentType?.startsWith("video/") ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={a.url} className="h-full w-full object-cover" controls muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.caption ?? a.kind} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="p-2 space-y-1">
              <div className="flex items-center gap-1 justify-between">
                <Badge variant="muted">{a.kind.replaceAll("_", " ")}</Badge>
                {a.isPrimary && <Badge variant="teal">Primary</Badge>}
              </div>
              {a.caption && <div className="text-xs text-muted-foreground line-clamp-2">{a.caption}</div>}
              <Link href={a.url} target="_blank" className="text-[10px] text-sgs-teal-700 hover:underline">Open</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadDialog({ gemstoneId }: { gemstoneId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><PlusCircle className="h-4 w-4" /> Upload media</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle><Camera className="inline h-4 w-4 mr-2" /> Upload media</DialogTitle></DialogHeader>
        <form
          action={(fd) => start(async () => { await uploadPhoto(fd); setOpen(false); })}
          className="space-y-3"
        >
          <input type="hidden" name="gemstoneId" value={gemstoneId} />
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <select name="kind" defaultValue="FINISHED_PHOTO" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="FINISHED_PHOTO">Finished photo</option>
              <option value="MACRO_PHOTO">Macro photo</option>
              <option value="VIDEO">Video</option>
              <option value="CATALOGUE_IMAGE">Catalogue image</option>
              <option value="SOCIAL_ASSET">Social asset</option>
              <option value="CERTIFICATE_IMAGE">Certificate image</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="space-y-1.5"><Label>File</Label><Input name="file" type="file" accept="image/*,video/*" /></div>
          <div className="space-y-1.5"><Label>…or external URL</Label><Input name="url" placeholder="https://…" /></div>
          <div className="space-y-1.5"><Label>Caption</Label><Textarea name="caption" rows={2} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPrimary" /> Set as primary for this kind
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
