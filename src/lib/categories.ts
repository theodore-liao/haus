/** Haus spend categories. Plaid primaries plus Groceries, which Plaid often files under food or merchandise. */
export const HAUS_CATEGORIES: { code: string; label: string }[] = [
  { code: "GROCERIES", label: "Groceries" },
  { code: "FOOD_AND_DRINK", label: "Dining" },
  { code: "GENERAL_MERCHANDISE", label: "General merchandise" },
  { code: "ENTERTAINMENT", label: "Entertainment" },
  { code: "TRANSPORTATION", label: "Transportation" },
  { code: "TRAVEL", label: "Travel" },
  { code: "RENT_AND_UTILITIES", label: "Rent and utilities" },
  { code: "HOME_IMPROVEMENT", label: "Home improvement" },
  { code: "MEDICAL", label: "Medical" },
  { code: "PERSONAL_CARE", label: "Personal care" },
  { code: "GENERAL_SERVICES", label: "General services" },
  { code: "LOAN_PAYMENTS", label: "Loan payments" },
  { code: "BANK_FEES", label: "Bank fees" },
  { code: "GOVERNMENT_AND_NON_PROFIT", label: "Government and non-profit" },
  { code: "TRANSFER", label: "Transfer" },
  { code: "INCOME", label: "Income" },
  { code: "OTHER", label: "Other" },
];

const GROCERY_MERCHANTS = [
  "costco",
  "fred meyer",
  "fredmeyer",
  "qfc",
  "safeway",
  "kroger",
  "trader joe",
  "trader joes",
  "whole foods",
  "wholefoods",
  "aldi",
  "lidl",
  "winco",
  "grocery outlet",
  "h mart",
  "hmart",
  "uwajimaya",
  "pcc ",
  "new seasons",
  "sprouts",
  "publix",
  "wegmans",
  "meijer",
  "food lion",
  "harris teeter",
  "shoprite",
  "stop shop",
  "albertsons",
  "vons",
  "ralphs",
  "king soopers",
  "frys food",
  "metropolitan market",
  "99 ranch",
  "instacart",
  "amazon fresh",
  "whole foods market",
];

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function groceryMerchant(name: string | null | undefined) {
  if (!name) return false;
  const n = ` ${norm(name)} `;
  return GROCERY_MERCHANTS.some((m) => n.includes(` ${m} `) || n.includes(m));
}

function paymentBlob(t: {
  merchant?: string | null;
  merchantName?: string | null;
  userMerchant?: string | null;
  name?: string | null;
}) {
  return `${t.name ?? ""} ${t.merchantName ?? ""} ${t.userMerchant ?? ""} ${t.merchant ?? ""}`.toLowerCase();
}

export function isCreditCardPayment(t: {
  isCcPayment?: boolean;
  merchant?: string | null;
  merchantName?: string | null;
  userMerchant?: string | null;
  name?: string | null;
}) {
  if (t.isCcPayment) return true;
  const blob = paymentBlob(t);
  if (/credit card payment|cc payment|payment to (your )?credit/.test(blob)) return true;
  return false;
}

export function isInvestFunding(t: {
  isTransfer?: boolean;
  isCcPayment?: boolean;
  userCategory?: string | null;
  categoryPrimary?: string | null;
  categoryDetailed?: string | null;
  merchant?: string | null;
  merchantName?: string | null;
  userMerchant?: string | null;
  name?: string | null;
}) {
  if (effectiveCategory(t) === "INCOME") return false;
  const blob = `${t.merchantName ?? ""} ${t.userMerchant ?? ""} ${t.name ?? ""} ${t.merchant ?? ""}`.toLowerCase();
  if (!/robinhood|fidelity|vanguard|schwab|wealthfront|betterment|e-?trade|m1 finance|sofi invest|acorns|public\.com|coinbase/.test(blob)) {
    return false;
  }
  return isInternalMove(t) || isTransferCategory(effectiveCategory(t));
}

/** Transfer in and transfer out are the same category. Older rows may still store either code. */
export function isTransferCategory(code: string | null | undefined) {
  return code === "TRANSFER" || code === "TRANSFER_IN" || code === "TRANSFER_OUT";
}

export function isInternalMove(t: {
  isTransfer?: boolean;
  isCcPayment?: boolean;
  userCategory?: string | null;
  categoryPrimary?: string | null;
  categoryDetailed?: string | null;
  merchant?: string | null;
  merchantName?: string | null;
  userMerchant?: string | null;
  name?: string | null;
  /** Same amount moved between two linked accounts. */
  pairedTransfer?: boolean;
}) {
  // A category chosen on this transaction wins. General merchandise stays general merchandise.
  if (t.userCategory && !isTransferCategory(t.userCategory)) return false;
  if (t.pairedTransfer) return true;
  if (t.isTransfer || isCreditCardPayment(t)) return true;
  return isTransferCategory(effectiveCategory(t));
}

export function effectiveCategory(t: {
  userCategory?: string | null;
  categoryPrimary?: string | null;
  categoryDetailed?: string | null;
  merchant?: string | null;
  merchantName?: string | null;
  userMerchant?: string | null;
  name?: string | null;
  pairedTransfer?: boolean;
}): string {
  if (t.userCategory && !isTransferCategory(t.userCategory)) return t.userCategory;
  if (t.pairedTransfer || (t.userCategory && isTransferCategory(t.userCategory))) return "TRANSFER";
  const merch = t.merchant || t.userMerchant || t.merchantName || t.name || "";
  const detailed = (t.categoryDetailed || "").toUpperCase();
  if (detailed.includes("GROCER") || groceryMerchant(merch)) return "GROCERIES";
  const primary = t.categoryPrimary || "OTHER";
  return isTransferCategory(primary) ? "TRANSFER" : primary;
}

export function merchantKey(name: string | null | undefined) {
  return (name || "").toLowerCase().trim();
}

const MATCHED_RULE = "\u0001matched";

/** Matched transfers are a separate merchant from the same description when it does not match. */
export function ruleKeyFor(name: string | null | undefined, matched: boolean) {
  const key = merchantKey(name);
  if (!key) return "";
  return matched ? `${key}${MATCHED_RULE}` : key;
}

export function ruleKeyIsMatched(key: string) {
  return key.endsWith(MATCHED_RULE);
}

export function ruleKeyBase(key: string) {
  return ruleKeyIsMatched(key) ? key.slice(0, -MATCHED_RULE.length) : key;
}

export function recurringMerchantKey(name: string | null | undefined) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function txnMerchantKey(t: {
  userMerchant?: string | null;
  merchantName?: string | null;
  name?: string | null;
}) {
  return merchantKey(t.userMerchant || t.merchantName || t.name);
}

export type MerchantScope = {
  merchantKey: string;
  accountId: string;
  nameContains: string;
  category: string | null;
  displayName: string | null;
};

/** How many extra constraints a scoped rule carries. Higher wins over a looser match. */
export function scopeScore(rule: { accountId: string; nameContains: string }) {
  return (rule.accountId ? 2 : 0) + (rule.nameContains ? 1 : 0);
}

/**
 * A scoped merchant rule matches when the merchant lines up and every constraint that
 * was set (this account, a phrase in the description) holds. Used so two payments that
 * share a bank description can be categorized differently.
 */
export function scopeMatches(
  rule: { merchantKey: string; accountId: string; nameContains: string },
  txn: { accountId: string; name: string; merchantName?: string | null; userMerchant?: string | null },
) {
  if (!rule.accountId && !rule.nameContains) return false;
  const blob = `${txn.name} ${txn.merchantName ?? ""} ${txn.userMerchant ?? ""}`.toLowerCase();
  const keys = [txn.merchantName, txn.name, txn.userMerchant].map((x) => merchantKey(x)).filter(Boolean);
  const merchantOk = keys.includes(rule.merchantKey) || (rule.merchantKey.length >= 3 && blob.includes(rule.merchantKey));
  if (!merchantOk) return false;
  if (rule.accountId && rule.accountId !== txn.accountId) return false;
  if (rule.nameContains && !blob.includes(rule.nameContains.trim().toLowerCase())) return false;
  return true;
}

export function bestScope<T extends MerchantScope>(rules: T[], txn: Parameters<typeof scopeMatches>[1]): T | null {
  let best: T | null = null;
  for (const rule of rules) {
    if (!scopeMatches(rule, txn)) continue;
    if (!best || scopeScore(rule) > scopeScore(best)) best = rule;
  }
  return best;
}
