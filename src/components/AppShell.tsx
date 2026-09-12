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
  //
  // The role is resolved here too, so /admin can appear in the nav without
  // every page having to look it up and pass it down. Read from the row rather
  // than the session — a promotion should show up on the next request, not
  // after the person signs in again.
  const [openTickets, unreadNotifications, viewer] = await Promise.all([
    db.ticket.count({ where: { status: { in: OPEN_STATUSES } } }).catch(() => 0),
    db.notification.count({ where: { readAt: null } }).catch(() => 0),
    db.user
      .findUnique({ where: { email }, select: { role: true } })
      .catch(() => null),
  ]);
  const isSuperadmin = viewer?.role === "SUPERADMIN";

  return (
    <div
      className={cn(
        "flex bg-sidebar",
        // A flush page pins its own footer, which only works if the shell has a
        // DEFINITE height — with min-h-screen the column grows with the
        // transcript and the composer rides down out of view. dvh rather than
        // vh so Safari's collapsing URL bar doesn't hide it either.
        flush ? "h-[100dvh] overflow-hidden" : "min-h-screen",
      )}
    >
      <SidebarNav
        email={email}
        openTickets={openTickets}
        unreadNotifications={unreadNotifications}
        isSuperadmin={isSuperadmin}
      />

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-background",
          // A rounded left edge and a hairline are what make the content read
          // as a surface laid on the sidebar rather than another region of it.
          "md:my-2 md:mr-2 md:rounded-xl md:shadow-[0_0_0_1px_hsl(var(--hairline))]",
          flush ? "flex min-h-0 flex-col overflow-hidden" : "",
          className,
        )}
      >
        <MobileNav openTickets={openTickets} isSuperadmin={isSuperadmin} />
        {children}
      </div>
    </div>
  );
}
