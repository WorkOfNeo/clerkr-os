import { db } from "@/lib/db";
import { OPEN_STATUSES } from "@/lib/ticket-meta";
import { cn } from "@/lib/utils";

import { MobileNav } from "./MobileNav";
import { SidebarNav } from "./SidebarNav";

/**
 * The frame every page sits in: a structural sidebar on the left and a raised
 * content surface beside it. Replaces the old top nav — a vertical rail scales
 * to a dozen destinations where a horizontal bar was already crowded at nine.
 *
 * `flush` is for pages that own their whole viewport (the intake conversation,
 * which has its own scroll regions and composer pinned to the bottom).
 */
export async function AppShell({
  email,
  children,
  flush,
  className,
}: {
  email: string;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
}) {
  // The one live number in the chrome. Counting here rather than in each page
  // keeps the badge honest wherever you happen to be.
  const [openTickets, unreadNotifications] = await Promise.all([
    db.ticket.count({ where: { status: { in: OPEN_STATUSES } } }).catch(() => 0),
    db.notification.count({ where: { readAt: null } }).catch(() => 0),
  ]);

  return (
    <div className="flex min-h-screen bg-sidebar">
      <SidebarNav
        email={email}
        openTickets={openTickets}
        unreadNotifications={unreadNotifications}
      />

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-background",
          // A rounded left edge and a hairline are what make the content read
          // as a surface laid on the sidebar rather than another region of it.
          "md:my-2 md:mr-2 md:rounded-xl md:shadow-[0_0_0_1px_hsl(var(--hairline))]",
          flush ? "flex flex-col overflow-hidden" : "",
          className,
        )}
      >
        <MobileNav openTickets={openTickets} />
        {children}
      </div>
    </div>
  );
}
