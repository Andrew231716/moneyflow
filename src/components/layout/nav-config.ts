import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PieChart,
  Target,
  Repeat,
  BarChart3,
  Bot,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  mobile?: boolean;
}

export const mainNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/transactions", label: "Movimenti", icon: ArrowLeftRight, mobile: true },
  { href: "/accounts", label: "Conti", icon: Wallet, mobile: true },
  { href: "/budgets", label: "Budget", icon: PieChart, mobile: false },
  { href: "/goals", label: "Obiettivi", icon: Target, mobile: false },
  { href: "/recurring", label: "Ricorrenti", icon: Repeat, mobile: false },
  { href: "/statistics", label: "Statistiche", icon: BarChart3, mobile: true },
  { href: "/assistant", label: "Assistente", icon: Bot, mobile: true },
  { href: "/settings", label: "Impostazioni", icon: Settings, mobile: false },
];

export const mobileNav = mainNav.filter((n) => n.mobile);
