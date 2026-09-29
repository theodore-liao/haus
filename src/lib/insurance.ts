// Policy kinds and yearly premiums for the Insurance page and the Overview renewal note.

export const POLICY_TYPES = [
  { id: "health", label: "Medical" },
  { id: "dental", label: "Dental" },
  { id: "vision", label: "Vision" },
  { id: "auto", label: "Auto" },
  { id: "home", label: "Home" },
  { id: "renters", label: "Renters" },
  { id: "life", label: "Life" },
  { id: "disability", label: "Disability" },
  { id: "umbrella", label: "Umbrella" },
  { id: "other", label: "Other" },
] as const;

export type PolicyType = (typeof POLICY_TYPES)[number]["id"];

/** Vehicle cards are saved as "vehicle"; they are auto policies. */
export function policyType(type: string): PolicyType {
  if (type === "vehicle") return "auto";
  return (POLICY_TYPES.find((t) => t.id === type)?.id ?? "other") as PolicyType;
}

export function policyTypeLabel(type: string) {
  return POLICY_TYPES.find((t) => t.id === policyType(type))?.label ?? "Other";
}

export function billingPerYear(frequency: string | null | undefined) {
  const f = (frequency ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (f.startsWith("month")) return 12;
  if (f.startsWith("quarter")) return 4;
  if (f.startsWith("semi") || f.includes("6month") || f.includes("sixmonth")) return 2;
  return 1;
}

export function yearlyPremium(p: { premium: number | null; billingFrequency: string | null }) {
  return p.premium != null && p.premium > 0 ? p.premium * billingPerYear(p.billingFrequency) : null;
}
