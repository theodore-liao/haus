import {
  Activity,
  Baby,
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
  { href: "/crypto", label: "Cryptocurrencies", icon: Coins },
  { href: "/retirement", label: "Retirement accounts", icon: Landmark },
  { href: "/property", label: "Property", icon: Building2 },
  { href: "/insurance", label: "Insurance", icon: Shield },
  { href: "/children", label: "Children", icon: Baby },
  { href: "/insights", label: "Insights", icon: ScanSearch },
  { href: "/connections", label: "Manage connections", icon: Link2 },
  { href: "/transactions", label: "Manage transactions", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const NAV_ORDER_KEY = "haus.navOrder";

export const MOBILE_PRIMARY = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/spending", label: "Spending", icon: Receipt },
  { href: "/investments", label: "Stocks", icon: LineChart },
] as const;
