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
  { code: "TRANSFER_IN", label: "Transfer in" },
  { code: "TRANSFER_OUT", label: "Transfer out" },
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
  if (/\bbilt\s+card\b/.test(blob)) return true;
  if (/credit card payment|cc payment|payment to (your )?credit/.test(blob)) return true;
  return false;
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
}) {
  if (t.isTransfer || isCreditCardPayment(t)) return true;
  const cat = effectiveCategory(t);
  return cat === "TRANSFER_IN" || cat === "TRANSFER_OUT";
}

export function effectiveCategory(t: {
  userCategory?: string | null;
  categoryPrimary?: string | null;
  categoryDetailed?: string | null;
  merchant?: string | null;
  merchantName?: string | null;
  userMerchant?: string | null;
  name?: string | null;
}): string {
  if (t.userCategory) return t.userCategory;
  const merch = t.merchant || t.userMerchant || t.merchantName || t.name || "";
  const detailed = (t.categoryDetailed || "").toUpperCase();
  if (detailed.includes("GROCER") || groceryMerchant(merch)) return "GROCERIES";
  return t.categoryPrimary || "OTHER";
}

export function merchantKey(name: string | null | undefined) {
  return (name || "").toLowerCase().trim();
}

export function txnMerchantKey(t: {
  userMerchant?: string | null;
  merchantName?: string | null;
  name?: string | null;
}) {
  return merchantKey(t.userMerchant || t.merchantName || t.name);
}
