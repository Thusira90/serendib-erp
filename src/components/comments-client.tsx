"use client";

import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { addComment, deleteComment } from "@/app/(app)/comments/actions";

export function CommentComposer({
  entity, entityId, entityCode, revalidate,
}: {
  entity: string;
  entityId: string;
  entityCode?: string | null;
  revalidate: string;
}) {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={(fd) => start(async () => {
        await addComment(fd);
        formRef.current?.reset();
      })}
      className="space-y-2"
    >
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="entityCode" value={entityCode ?? ""} />
      <input type="hidden" name="revalidate" value={revalidate} />
      <Textarea name="text" required rows={2} maxLength={4000} placeholder="Leave a note the team should see…" />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Posting…" : "Post note"}</Button>
      </div>
    </form>
  );
}

export function DeleteCommentButton({ id, revalidate }: { id: string; revalidate: string }) {
  const [pending, start] = useTransition();
  return (
    <form action={(fd) => start(() => deleteComment(fd))}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revalidate" value={revalidate} />
      <Button size="icon" variant="ghost" disabled={pending} title="Delete note">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}
