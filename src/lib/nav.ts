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

export const MOBILE_PRIMARY = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/spending", label: "Spending", icon: Receipt },
  { href: "/investments", label: "Stocks", icon: LineChart },
] as const;
