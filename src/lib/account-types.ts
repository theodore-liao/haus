export type HausType =
  | "checking"
  | "savings"
  | "cash_management"
  | "credit_card"
  | "mortgage"
  | "installment"
  | "brokerage"
  | "robo"
  | "ira"
  | "roth"
  | "401k"
  | "403b"
  | "hsa"
  | "529"
  | "custodial"
  | "trump"
  | "real_estate"
  | "vehicle"
  | "insurance"
  | "other_asset"
  | "other_liability";

const LABELS: Record<HausType, string> = {
  checking: "Checking",
  savings: "Savings",
  cash_management: "Cash management",
  credit_card: "Credit card",
  mortgage: "Mortgage",
  installment: "Installment loan",
  brokerage: "Brokerage",
  robo: "Robo",
  ira: "IRA",
  roth: "Roth IRA",
  "401k": "401(k)",
  "403b": "403(b)",
  hsa: "HSA",
  "529": "529",
  custodial: "Custodial",
  trump: "Trump Account",
  real_estate: "Real estate",
  vehicle: "Vehicle",
  insurance: "Insurance",
  other_asset: "Other asset",
  other_liability: "Other liability",
};

export function hausTypeLabel(type: string): string {
  return LABELS[type as HausType] ?? type;
}

export function mapPlaidToHausType(type: string, subtype: string | null): HausType {
  const t = (type || "").toLowerCase();
  const s = (subtype || "").toLowerCase();

  if (t === "depository") {
    if (s.includes("hsa")) return "hsa";
    if (s.includes("checking")) return "checking";
    if (s.includes("saving")) return "savings";
    if (s.includes("cash management") || s === "cd" || s.includes("money market")) {
      return "cash_management";
    }
    return "checking";
  }

  if (t === "credit") return "credit_card";

  if (t === "loan") {
    if (s.includes("mortgage")) return "mortgage";
    return "installment";
  }

  if (t === "investment" || t === "brokerage") {
    if (s.includes("roth")) return "roth";
    if (s.includes("401k") || s === "401k") return "401k";
    if (s.includes("403")) return "403b";
    if (s.includes("hsa")) return "hsa";
    if (s.includes("529") || s.includes("education")) return "529";
    if (s.includes("ugma") || s.includes("utma")) return "custodial";
    if (s.includes("sep") || s === "ira" || s.endsWith(" ira") || s.includes("traditional")) {
      return "ira";
    }
    if (s.includes("robo")) return "robo";
    if (
      s.includes("pension") ||
      s.includes("retirement") ||
      s.includes("keogh") ||
      s.includes("profit sharing")
    ) {
      return "ira";
    }
    return "brokerage";
  }

  if (t === "other") return "other_asset";
  return "other_asset";
}

export function isRetirementType(h: string): boolean {
  return h === "ira" || h === "roth" || h === "401k" || h === "403b" || h === "hsa";
}

export function isCashType(h: string): boolean {
  return h === "checking" || h === "savings" || h === "cash_management";
}

export function isLiabilityType(h: string): boolean {
  return h === "credit_card" || h === "mortgage" || h === "installment" || h === "other_liability";
}

export function isInvestmentType(h: string): boolean {
  return (
    h === "brokerage" ||
    h === "robo" ||
    h === "ira" ||
    h === "roth" ||
    h === "401k" ||
    h === "403b" ||
    h === "hsa" ||
    h === "529" ||
    h === "custodial" ||
    h === "trump"
  );
}

export function isChildAccountType(h: string): boolean {
  return h === "529" || h === "custodial" || h === "trump";
}

export function retirementKindFromHaus(h: string): string | null {
  if (isRetirementType(h)) return h;
  return null;
}

export function allocationBucket(
  h: string,
): "cash" | "stocks" | "crypto" | "retirement" | "real_estate" | "vehicles" | "child_accounts" | "other" {
  if (isCashType(h)) return "cash";
  if (isRetirementType(h)) return "retirement";
  if (h === "brokerage" || h === "robo") return "stocks";
  if (h === "real_estate") return "real_estate";
  if (h === "vehicle") return "vehicles";
  if (isChildAccountType(h)) return "child_accounts";
  return "other";
}
