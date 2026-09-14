import Link from "next/link";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { Inbox, CheckCheck } from "lucide-react";
import { dismissNotification, markAllRead, markNotificationRead } from "./actions";

const typeLabel: Record<string, { label: string; variant: "muted" | "teal" | "purple" | "success" | "warning" | "danger" }> = {
  SALE_CREATED:         { label: "Sale",              variant: "success" },
  PAYMENT_RECORDED:     { label: "Payment",           variant: "success" },
  RESERVATION_CREATED:  { label: "Reservation",       variant: "warning" },
  RESERVATION_RELEASED: { label: "Reservation",       variant: "muted" },
  RESERVATION_EXPIRING: { label: "Reservation!",      variant: "danger" },
  QUOTATION_ACCEPTED:   { label: "Quotation",         variant: "purple" },
  QUOTATION_EXPIRING:   { label: "Quotation!",        variant: "danger" },
  CERTIFICATE_ISSUED:   { label: "Certificate",       variant: "success" },
  CGI_MASTER_SET:       { label: "CGI master",        variant: "purple" },
  SHIPMENT_CREATED:     { label: "Shipment",          variant: "teal" },
  SHIPMENT_DELIVERED:   { label: "Delivered",         variant: "success" },
  ENQUIRY_NEW:          { label: "Enquiry",           variant: "teal" },
  CUTTING_COMPLETED:    { label: "Cutting",           variant: "purple" },
  ALERT:                { label: "Alert",             variant: "warning" },
};

export default async function InboxPage() {
  const session = await requireAuth();
  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id, dismissedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const unread = notifications.filter((n) => n.readAt == null).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3"><Inbox className="h-7 w-7 text-sgs-teal-500" /> Inbox</h1>
          <p className="text-sm text-muted-foreground">Things that happened in the business you own.</p>
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <Button variant="outline"><CheckCheck className="h-4 w-4" /> Mark all read</Button>
          </form>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>All notifications</span>
            {unread > 0 && <Badge variant="accent">{unread} unread</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y">
          {notifications.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Inbox is empty. New activity will show up here.</div>
          )}
          {notifications.map((n) => {
            const meta = typeLabel[n.type] ?? { label: n.type, variant: "muted" as const };
            const unread = n.readAt == null;
            return (
              <div key={n.id} className={`p-4 flex items-start gap-3 ${unread ? "bg-sgs-teal-50/40" : ""}`}>
                <div className="mt-1">
                  <span className={`inline-block h-2 w-2 rounded-full ${unread ? "bg-sgs-purple-500" : "bg-muted"}`} />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    <span className="text-sm font-medium">{n.title}</span>
                    {n.entityCode && <span className="text-xs font-mono text-muted-foreground">{n.entityCode}</span>}
                  </div>
                  {n.body && <div className="text-sm text-muted-foreground mt-1">{n.body}</div>}
                  <div className="text-xs text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</div>
                </div>
                <div className="flex flex-col gap-1">
                  {n.url && (
                    <Button asChild size="sm" variant="outline"><Link href={n.url}>Open</Link></Button>
                  )}
                  {unread && (
                    <form action={markNotificationRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <Button size="sm" variant="ghost">Mark read</Button>
                    </form>
                  )}
                  <form action={dismissNotification}>
                    <input type="hidden" name="id" value={n.id} />
                    <Button size="sm" variant="ghost">Dismiss</Button>
                  </form>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
