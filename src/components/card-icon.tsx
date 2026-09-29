import { createElement } from "react";
import {
  Activity,
  ArrowLeftRight,
  BellRing,
  CalendarDays,
  ChartCandlestick,
  ChartLine,
  ChartPie,
  Compass,
  Database,
  GraduationCap,
  Landmark,
  Layers,
  Link2,
  Lock,
  Monitor,
  PanelLeft,
  PencilLine,
  PiggyBank,
  ReceiptText,
  Repeat,
  Shapes,
  Undo2,
  Users,
  Wallet,
  Waves,
  type LucideIcon,
} from "lucide-react";

/** One small icon per card title, so every card announces itself the same way. Titles without one show none. */
const ICONS: Record<string, LucideIcon> = {
  "needs attention": BellRing,
  "net worth": ChartLine,
  value: ChartLine,
  allocation: ChartPie,
  "spend category": ChartPie,
  cashflow: Waves,
  "month by month": CalendarDays,
  budget: Wallet,
  recurring: Repeat,
  refunds: Undo2,
  transactions: ReceiptText,
  "synced transactions": ReceiptText,
  holdings: Layers,
  lots: Layers,
  trades: ArrowLeftRight,
  price: ChartCandlestick,
  "by account": Landmark,
  "by class": Shapes,
  "by asset": Shapes,
  "largest moves": Activity,
  "retirement accounts": PiggyBank,
  "child accounts": GraduationCap,
  "retirement planner": Compass,
  wallets: Wallet,
  "manual entries": PencilLine,
  household: Users,
  display: Monitor,
  tabs: PanelLeft,
  data: Database,
  "privacy & session": Lock,
  connections: Link2,
};

export function cardIcon(title: unknown): LucideIcon | null {
  return typeof title === "string" ? (ICONS[title.trim().toLowerCase()] ?? null) : null;
}

export function CardIcon({ title }: { title: unknown }) {
  const icon = cardIcon(title);
  return icon ? createElement(icon, { "aria-hidden": true, className: "card-icon" }) : null;
}
