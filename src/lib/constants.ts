/** IRS limits for calendar year 2026. Sourced 28 Aug 2026 from IRS Notice 2025-67 and Rev. Proc. 2025-32. */
export const IRS_LIMITS_YEAR = 2026;

export const IRS_LIMITS = {
  ira: 7_500,
  iraCatchUp: 1_100,
  electiveDeferral: 24_500,
  electiveCatchUp: 8_000,
  electiveSuperCatchUp: 11_250,
  hsaSelf: 4_400,
  hsaFamily: 8_750,
  hsaCatchUp: 1_000,
  trumpAccount: 5_000,
} as const;

export const STALE_SYNC_HOURS = 4;
export const STALE_CONNECTION_HOURS = 48;
export const INSURANCE_RENEWAL_DAYS = 60;
export const CONCENTRATION_FLAG = 0.15;
export const HIGH_UTILIZATION = 0.3;
/** Manual stock lots stored as a dollar amount, not a live ticker. */
export const FIXED_USD_ID = "usd-fixed";

export const PFC_LABELS: Record<string, string> = {
  INCOME: "Income",
  TRANSFER: "Transfer",
  TRANSFER_IN: "Transfer",
  TRANSFER_OUT: "Transfer",
  LOAN_PAYMENTS: "Loan payments",
  BANK_FEES: "Bank fees",
  ENTERTAINMENT: "Entertainment",
  GROCERIES: "Groceries",
  FOOD_AND_DRINK: "Dining",
  GENERAL_MERCHANDISE: "General merchandise",
  HOME_IMPROVEMENT: "Home improvement",
  MEDICAL: "Medical",
  PERSONAL_CARE: "Personal care",
  GENERAL_SERVICES: "General services",
  GOVERNMENT_AND_NON_PROFIT: "Government and non-profit",
  TRANSPORTATION: "Transportation",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Rent and utilities",
  OTHER: "Other",
  INCOME_WAGES: "Paychecks",
  INCOME_OTHER_INCOME: "Other income",
  INCOME_DIVIDENDS: "Dividends",
  INCOME_INTEREST_EARNED: "Interest",
  INCOME_RETIREMENT_PENSION: "Retirement income",
  INCOME_TAX_REFUND: "Tax refund",
  INCOME_UNEMPLOYMENT: "Unemployment",
  INCOME_CHILD_SUPPORT: "Child support",
  INCOME_RENTAL: "Rental income",
};

export const ESSENTIAL_CATEGORIES = new Set([
  "RENT_AND_UTILITIES",
  "MEDICAL",
  "TRANSPORTATION",
  "LOAN_PAYMENTS",
  "GOVERNMENT_AND_NON_PROFIT",
  "GROCERIES",
]);

export const TRANSFER_CATEGORIES = new Set(["TRANSFER", "TRANSFER_IN", "TRANSFER_OUT"]);

export function categoryLabel(code: string | null | undefined): string {
  if (!code) return "Uncategorized";
  if (PFC_LABELS[code]) return PFC_LABELS[code];
  return code
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function genericInterest(s: string | null | undefined) {
  return !!s && /^interest(\s+paid)?$/i.test(s.trim());
}

export function incomeSourceLabel(t: {
  categoryPrimary?: string | null;
  categoryDetailed?: string | null;
  userCategory?: string | null;
  userMerchant?: string | null;
  merchantName?: string | null;
  name?: string | null;
  accountName?: string;
}): string {
  if (t.userCategory && t.userCategory !== "INCOME") return categoryLabel(t.userCategory);
  const merch = t.userMerchant || t.merchantName;
  const detailed = t.categoryDetailed || "";
  const interest = detailed.includes("INTEREST") || genericInterest(merch) || genericInterest(t.name);
  if (interest) return "Interest";
  // A transfer the household relabelled as income is a paycheck routed through another account;
  // Plaid's TRANSFER_IN_* detail must not leak through as the source name.
  if (t.userCategory === "INCOME" && !detailed.startsWith("INCOME")) return categoryLabel("INCOME_SALARY");
  if (detailed && detailed !== "INCOME" && detailed !== "INCOME_OTHER_INCOME") {
    return categoryLabel(detailed);
  }
  if (merch) return merch;
  if (t.name) return t.name;
  return "Other income";
}
