import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PieChart,
  Target,
  HandCoins,
  Repeat,
  BarChart3,
  Bot,
  Settings,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in desktop sidebar */
  sidebar?: boolean;
  /** Primary mobile bottom nav (max 4 + Altro) */
  mobilePrimary?: boolean;
  /** Shown in mobile "Altro" sheet */
  mobileMore?: boolean;
}

export const mainNav: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard, sidebar: true, mobilePrimary: true },
  {
    href: "/transactions",
    label: "Movimenti",
    icon: ArrowLeftRight,
    sidebar: true,
    mobilePrimary: true,
  },
  { href: "/accounts", label: "Conti", icon: Wallet, sidebar: true, mobilePrimary: true },
  { href: "/budgets", label: "Budget", icon: PieChart, sidebar: true, mobilePrimary: true },
  { href: "/goals", label: "Obiettivi", icon: Target, sidebar: true, mobileMore: true },
  { href: "/debts", label: "Debiti", icon: HandCoins, sidebar: true, mobileMore: true },
  { href: "/recurring", label: "Ricorrenti", icon: Repeat, sidebar: true, mobileMore: true },
  {
    href: "/statistics",
    label: "Statistiche",
    icon: BarChart3,
    sidebar: true,
    mobileMore: true,
  },
  { href: "/assistant", label: "Gestore", icon: Bot, sidebar: true, mobileMore: true },
  {
    href: "/settings",
    label: "Impostazioni",
    icon: Settings,
    sidebar: true,
    mobileMore: true,
  },
];

export const sidebarNav = mainNav.filter((n) => n.sidebar !== false);
export const mobilePrimaryNav = mainNav.filter((n) => n.mobilePrimary);
export const mobileMoreNav = mainNav.filter((n) => n.mobileMore);

/** @deprecated use mobilePrimaryNav — kept for any leftover imports */
export const mobileNav = mobilePrimaryNav;

export const moreNavItem = {
  label: "Altro",
  icon: MoreHorizontal,
} as const;
