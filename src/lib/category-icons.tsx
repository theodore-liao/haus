"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  Car,
  CircleDashed,
  Clapperboard,
  Hammer,
  HeartPulse,
  HelpCircle,
  Home,
  Landmark,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/lib/constants";

const BY_CODE: Record<string, LucideIcon> = {
  GROCERIES: ShoppingCart,
  FOOD_AND_DRINK: UtensilsCrossed,
  GENERAL_MERCHANDISE: ShoppingBag,
  ENTERTAINMENT: Clapperboard,
  TRANSPORTATION: Car,
  TRAVEL: Plane,
  RENT_AND_UTILITIES: Home,
  HOME_IMPROVEMENT: Hammer,
  MEDICAL: HeartPulse,
  PERSONAL_CARE: Sparkles,
  GENERAL_SERVICES: Wrench,
  LOAN_PAYMENTS: Landmark,
  BANK_FEES: Receipt,
  GOVERNMENT_AND_NON_PROFIT: Building2,
  TRANSFER_IN: ArrowDownLeft,
  TRANSFER_OUT: ArrowUpRight,
  INCOME: Banknote,
  OTHER: CircleDashed,
  INCOME_WAGES: Banknote,
  INCOME_OTHER_INCOME: Banknote,
  INCOME_DIVIDENDS: Banknote,
  INCOME_INTEREST_EARNED: Banknote,
  INCOME_RETIREMENT_PENSION: Landmark,
  INCOME_TAX_REFUND: Receipt,
  INCOME_UNEMPLOYMENT: Banknote,
  INCOME_CHILD_SUPPORT: Banknote,
  INCOME_RENTAL: Home,
};

const BY_LABEL: Record<string, LucideIcon> = {};
for (const [code, icon] of Object.entries(BY_CODE)) {
  BY_LABEL[categoryLabel(code).toLowerCase()] = icon;
}
BY_LABEL.paychecks = Banknote;
BY_LABEL.dividends = Banknote;
BY_LABEL.interest = Banknote;
BY_LABEL["other income"] = Banknote;
BY_LABEL["retirement income"] = Landmark;
BY_LABEL["tax refund"] = Receipt;
BY_LABEL.uncategorized = HelpCircle;
BY_LABEL.dining = UtensilsCrossed;
BY_LABEL.groceries = ShoppingCart;

export function iconForCategory(codeOrLabel: string | null | undefined): LucideIcon {
  const raw = (codeOrLabel ?? "").trim();
  if (!raw) return HelpCircle;
  if (BY_CODE[raw]) return BY_CODE[raw];
  const upper = raw.toUpperCase().replace(/ /g, "_");
  if (BY_CODE[upper]) return BY_CODE[upper];
  return BY_LABEL[raw.toLowerCase()] ?? CircleDashed;
}

export function hasCategoryIcon(codeOrLabel: string | null | undefined) {
  const raw = (codeOrLabel ?? "").trim();
  if (!raw) return false;
  if (BY_CODE[raw] || BY_CODE[raw.toUpperCase().replace(/ /g, "_")]) return true;
  return Boolean(BY_LABEL[raw.toLowerCase()]);
}

export function CategoryIcon({
  category,
  className,
}: {
  category: string | null | undefined;
  className?: string;
}) {
  const Icon = iconForCategory(category);
  return <Icon className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)} aria-hidden />;
}

export function CategoryName({
  category,
  className,
}: {
  category: string | null | undefined;
  className?: string;
}) {
  const label = categoryLabel(category);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <CategoryIcon category={category ?? label} />
      <span className="truncate">{label}</span>
    </span>
  );
}
