import {
  BookOpen,
  Brain,
  FolderOpen,
  LayoutGrid,
  Lightbulb,
  type LucideIcon,
  Network,
  Sparkles,
  SquareKanban,
  Ticket,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  label: string | null;
  items: NavItem[];
}

/**
 * Grouped by what you're doing, not by which table the data lives in. The
 * unlabelled first group is the daily loop; the rest is reference material you
 * reach for less often. Shared by the desktop rail and the mobile drawer so
 * they can't drift.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { href: "/chat", label: "Intake", icon: Sparkles },
      { href: "/tickets", label: "Tickets", icon: Ticket },
      { href: "/kanban", label: "Kanban", icon: SquareKanban },
    ],
  },
  {
    label: "Product",
    items: [
      { href: "/meetings", label: "Meetings", icon: Users },
      { href: "/features", label: "Features", icon: Lightbulb },
      { href: "/knowledge", label: "Knowledge", icon: Network },
    ],
  },
  {
    label: "Library",
    items: [
      { href: "/wiki", label: "Wiki", icon: BookOpen },
      { href: "/memory", label: "Memory", icon: Brain },
      { href: "/documents", label: "Documents", icon: FolderOpen },
      { href: "/grid", label: "Ideas", icon: LayoutGrid },
    ],
  },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
