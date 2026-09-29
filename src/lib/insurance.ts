import { parseJson } from "@/lib/utils";

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

type SlotPolicy = {
  id: string;
  type: string;
  owner: string;
  namedInsured: string;
  coveredMembers: string;
  vehicleId: string | null;
};

export function policyCoversMember(p: SlotPolicy, memberId: string) {
  if (p.owner === memberId || p.namedInsured === memberId) return true;
  return parseJson<string[]>(p.coveredMembers, []).includes(memberId);
}

/** The policies the Insurance page shows in a card slot; a premium on any other one is out of sight, so it is not counted. */
export function shownPolicies<T extends SlotPolicy>(policies: T[], memberIds: string[], vehicleIds: string[]): T[] {
  const shown = new Map<string, T>();
  const add = (p?: T) => {
    if (p) shown.set(p.id, p);
  };
  for (const m of memberIds) {
    for (const kind of ["health", "vision", "dental"]) add(policies.find((p) => p.type === kind && policyCoversMember(p, m)));
    for (const p of policies) if (p.type === "other" && policyCoversMember(p, m)) add(p);
  }
  for (const v of vehicleIds) add(policies.find((p) => p.type === "vehicle" && p.vehicleId === v));
  add(policies.find((p) => p.type === "home" && !p.vehicleId));
  return [...shown.values()];
}
