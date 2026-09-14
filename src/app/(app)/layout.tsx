import { requireAuth } from "@/lib/rbac";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { unreadCount } from "@/lib/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const unread = await unreadCount(session.user.id);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <div className="print:hidden contents">
          <Sidebar role={session.user.role} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="print:hidden">
            <Topbar
              user={{ name: session.user.name ?? "", email: session.user.email ?? "", role: session.user.role }}
              unreadNotifications={unread}
            />
          </div>
          <main className="p-6 max-w-[1600px] mx-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
