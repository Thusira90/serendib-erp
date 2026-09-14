import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentComposer, DeleteCommentButton } from "./comments-client";
import { MessageSquare } from "lucide-react";

type Entity = "Gemstone" | "RoughStone" | "Customer" | "CuttingJob" | "SalesOrder" | "Enquiry" | "Quotation" | "Shipment";

/**
 * Reusable comment thread. Renders past comments plus a composer.
 * Drop into any detail page:
 *   <CommentsThread entity="Gemstone" entityId={g.id} entityCode={g.code} revalidate={`/gemstones/${g.id}`} />
 */
export async function CommentsThread({
  entity, entityId, entityCode, revalidate,
}: {
  entity: Entity;
  entityId: string;
  entityCode?: string | null;
  revalidate: string;
}) {
  const [session, comments] = await Promise.all([
    auth(),
    prisma.comment.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const currentUserId = session?.user?.id;
  const isAdmin = session?.user?.role === "ADMINISTRATOR";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-sgs-teal-500" />
          Notes
          {comments.length > 0 && <span className="text-xs text-muted-foreground">({comments.length})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <CommentComposer entity={entity} entityId={entityId} entityCode={entityCode} revalidate={revalidate} />
        <div className="divide-y">
          {comments.length === 0 && (
            <div className="text-sm text-muted-foreground py-2">No notes yet — jot down anything the team should know.</div>
          )}
          {comments.map((c) => {
            const canDelete = !!currentUserId && (c.authorId === currentUserId || isAdmin);
            return (
              <div key={c.id} className="py-3 flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-sgs-gradient text-white grid place-items-center text-xs font-medium shrink-0">
                  {(c.authorName ?? "?").split(" ").map(s => s[0]).slice(0, 2).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.authorName ?? "Someone"}</span>
                    <span> · {formatDateTime(c.createdAt)}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap mt-0.5">{c.text}</div>
                </div>
                {canDelete && (
                  <DeleteCommentButton id={c.id} revalidate={revalidate} />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
