import {
  Building2,
  Coins,
  FileText,
  Landmark,
  LayoutDashboard,
  LineChart,
  Link2,
  Receipt,
  Settings,
  Shield,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/spending", label: "Spending", icon: Receipt },
  { href: "/investments", label: "Stocks", icon: LineChart },
  { href: "/crypto", label: "Crypto", icon: Coins },
  { href: "/retirement", label: "Retirement", icon: Landmark },
  { href: "/property", label: "Property", icon: Building2 },
  { href: "/insurance", label: "Insurance", icon: Shield },
  { href: "/insights", label: "Insights", icon: ScanSearch },
  { href: "/connections", label: "Connections", icon: Link2 },
  { href: "/transactions", label: "Transactions", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const NAV_ORDER_KEY = "haus.navOrder";

/** Sidebar sections the household can hide. Crypto and insurance start off. */
export const OPTIONAL_NAV = [
  { href: "/crypto", key: "crypto", field: "showCrypto" },
  { href: "/retirement", key: "retirement", field: "showRetirement" },
  { href: "/property", key: "property", field: "showProperty" },
  { href: "/insurance", key: "insurance", field: "showInsurance" },
  { href: "/insights", key: "insights", field: "showInsights" },
] as const;

export type TabKey = (typeof OPTIONAL_NAV)[number]["key"];
export type TabField = (typeof OPTIONAL_NAV)[number]["field"];
export type TabVisibility = Record<TabKey, boolean>;

export const DEFAULT_TAB_VISIBILITY: TabVisibility = {
  crypto: false,
  retirement: true,
  property: true,
  insurance: false,
  insights: true,
};

export function visibleNav(items: NavItem[], tabs: TabVisibility): NavItem[] {
  return items.filter((item) => !OPTIONAL_NAV.some((tab) => tab.href === item.href && !tabs[tab.key]));
}

/** Keep hidden tabs in their places while the visible ones take a new order. */
export function mergeVisibleOrder(full: NavItem[], visibleNext: NavItem[]): NavItem[] {
  const queue = [...visibleNext];
  const moving = new Set(visibleNext.map((item) => item.href));
  return full.map((item) => (moving.has(item.href) ? queue.shift()! : item));
}

export const MOBILE_PRIMARY = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/spending", label: "Spending", icon: Receipt },
  { href: "/investments", label: "Stocks", icon: LineChart },
] as const;
