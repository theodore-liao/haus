import {
  Activity,
  Baby,
  BarChart3,
  Building2,
  Car,
  Coins,
  FileText,
  Landmark,
  LayoutDashboard,
  LineChart,
  Settings,
  Shield,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Activity },
  { href: "/investments", label: "Equities", icon: LineChart },
  { href: "/crypto", label: "Cryptocurrencies", icon: Coins },
  { href: "/retirement", label: "Retirement", icon: Landmark },
  { href: "/real-estate", label: "Real Estate", icon: Building2 },
  { href: "/vehicles", label: "Vehicles", icon: Car },
  { href: "/insurance", label: "Insurance", icon: Shield },
  { href: "/children", label: "Children", icon: Baby },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/insights", label: "Insights", icon: ScanSearch },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const NAV_ORDER_KEY = "haus.navOrder";

export const MOBILE_PRIMARY = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Activity", icon: Activity },
  { href: "/investments", label: "Equities", icon: BarChart3 },
] as const;
