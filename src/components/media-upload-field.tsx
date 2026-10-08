"use client";

import { useRef, useState } from "react";
import { Upload, X, Image as ImageIcon, Film } from "lucide-react";

/**
 * Styled multi-file picker for forms. Bare <input type="file"> hidden behind
 * a nicer "Upload" button; selected files are listed with a per-item remove.
 *
 * On submit, the form serializes the hidden input just like any other file
 * input — no server-side change needed. The remove buttons work by rebuilding
 * the input's FileList via a DataTransfer.
 */
export function MediaUploadField({
  name,
  accept = "image/*,video/*",
  helper,
  multiple = true,
  buttonLabel,
  onFiles,
}: {
  name: string;
  accept?: string;
  helper?: React.ReactNode;
  /** false = a single file; choosing another replaces it. */
  multiple?: boolean;
  buttonLabel?: string;
  /** Called with the current selection whenever it changes (e.g. to read a CSV). */
  onFiles?: (files: File[]) => void;
}) {
  buttonLabel ??= multiple ? "Upload files" : "Choose file";
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  const sync = (arr: File[]) => {
    setFiles(arr);
    onFiles?.(arr);
    if (!inputRef.current) return;
    const dt = new DataTransfer();
    arr.forEach((f) => dt.items.add(f));
    inputRef.current.files = dt.files;
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        name={name}
        type="file"
        multiple={multiple}
        accept={accept}
        className="sr-only"
        onChange={(e) => sync(Array.from(e.target.files ?? []).slice(0, multiple ? undefined : 1))}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-sgs-teal-500 text-white text-sm font-medium hover:bg-sgs-teal-600 transition-colors"
        >
          <Upload className="h-4 w-4" />
          {buttonLabel}
        </button>
        <span className="text-xs text-muted-foreground">
          {files.length === 0 ? (multiple ? "No files chosen" : "No file chosen") : `${files.length} file${files.length === 1 ? "" : "s"} chosen`}
        </span>
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => {
            const isVideo = f.type.startsWith("video/");
            return (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border bg-secondary/30 px-2 py-1 text-xs">
                {isVideo ? <Film className="h-3.5 w-3.5 text-sgs-purple-500" /> : <ImageIcon className="h-3.5 w-3.5 text-sgs-teal-600" />}
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  className="text-muted-foreground hover:text-red-600"
                  onClick={() => sync(files.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {helper && <div className="text-[10px] text-muted-foreground">{helper}</div>}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
