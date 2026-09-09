export type OwnerFilter = "all" | "a" | "b" | "children";
export type OwnerId = "a" | "b" | "joint" | `child:${string}`;

export type HouseholdNames = {
  nameA: string;
  nameB: string;
  children: { id: string; name: string }[];
};

export const OWNER_COOKIE = "haus_owner";

export function isOwnerFilter(v: string | undefined | null): v is OwnerFilter {
  return v === "all" || v === "a" || v === "b" || v === "children";
}

export function matchesOwner(owner: string, filter: OwnerFilter): boolean {
  if (filter === "all") return true;
  if (filter === "a") return owner === "a" || owner === "joint";
  if (filter === "b") return owner === "b" || owner === "joint";
  if (filter === "children") return owner.startsWith("child:");
  return true;
}

export function ownerLabel(owner: string, names: HouseholdNames): string {
  if (owner === "a") return names.nameA;
  if (owner === "b") return names.nameB;
  if (owner === "joint") return "Joint";
  if (owner.startsWith("child:")) {
    const id = owner.slice("child:".length);
    const child = names.children.find((c) => c.id === id || c.name === id);
    return child?.name ?? id;
  }
  return owner;
}

export function ownerOptions(names: HouseholdNames) {
  return [
    { value: "a", label: names.nameA },
    { value: "b", label: names.nameB },
    { value: "joint", label: "Joint" },
    ...names.children.map((c) => ({ value: `child:${c.id}`, label: c.name })),
  ];
}
