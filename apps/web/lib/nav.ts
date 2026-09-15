import { BarChart3, CircleDollarSign, Database, FlaskConical, Home, ListChecks, Search, Sun, type LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** The one question the screen answers. */
  question: string;
}
export interface NavSectionDef {
  key: "recover" | "act" | "prove";
  label: string;
  items: NavItem[];
}

export const NAV_TOP: NavItem[] = [
  { id: "home", label: "Home", href: "/", icon: Home, question: "What have we proved, and what needs me this week?" },
  { id: "today", label: "Today", href: "/today", icon: Sun, question: "What do I do right now?" },
];

export const NAV_SECTIONS: NavSectionDef[] = [
  {
    key: "recover",
    label: "Recover",
    items: [
      { id: "recovery", label: "Profit Recovery", href: "/recovery", icon: CircleDollarSign, question: "Where do opportunities go, and why do they die?" },
      { id: "findings", label: "Findings", href: "/findings", icon: Search, question: "Why is money leaking, and what should change?" },
    ],
  },
  {
    key: "act",
    label: "Act",
    items: [
      { id: "actions", label: "Actions", href: "/actions", icon: ListChecks, question: "Did someone do the thing?" },
      { id: "changes", label: "Changes", href: "/changes", icon: FlaskConical, question: "Did the change work, and how much is ours?" },
    ],
  },
  {
    key: "prove",
    label: "Prove",
    items: [
      { id: "proof", label: "ROI proof", href: "/proof", icon: BarChart3, question: "What have we actually proved, and what is it worth?" },
      { id: "data", label: "Data", href: "/data", icon: Database, question: "Can I trust these numbers?" },
    ],
  },
];

export const ALL_NAV: NavItem[] = [...NAV_TOP, ...NAV_SECTIONS.flatMap((s) => s.items)];

export function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navForPathname(pathname: string): NavItem | undefined {
  return ALL_NAV.filter((n) => isActive(n.href, pathname)).sort((a, b) => b.href.length - a.href.length)[0];
}

export function titleForPathname(pathname: string): string {
  if (pathname.startsWith("/findings/")) return "Finding";
  if (pathname.startsWith("/changes/")) return "Change";
  if (pathname.startsWith("/proof/")) return "Proof packet";
  return navForPathname(pathname)?.label ?? "Streamline";
}
