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

/** First token only — surnames stay in Settings storage, never in the UI. */
export function givenName(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0] ?? t;
}

export function ownerLabel(owner: string, names: HouseholdNames): string {
  if (owner === "a") return givenName(names.nameA) || names.nameA;
  if (owner === "b") return givenName(names.nameB) || names.nameB;
  if (owner === "joint") return "Joint";
  if (owner.startsWith("child:")) {
    const id = owner.slice("child:".length);
    const child = names.children.find((c) => c.id === id || c.name === id);
    return child ? givenName(child.name) || child.name : id;
  }
  return owner;
}

/** Account/institution first, then holder after a dash. */
export function withHolder(label: string, holder: string | null | undefined): string {
  const a = (label ?? "").trim();
  const o = (holder ?? "").trim();
  if (!o) return a;
  if (!a) return o;
  if (a === o || a.endsWith(` - ${o}`)) return a;
  return `${a} - ${o}`;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Child this account is for: owner `child:id`, beneficiary, or a name in the account title. */
export function childLabelFor(
  names: HouseholdNames,
  opts: { owner: string; name?: string | null; beneficiary?: string | null },
): string | null {
  if (opts.owner.startsWith("child:")) {
    const label = ownerLabel(opts.owner, names);
    return label || null;
  }
  const ben = (opts.beneficiary ?? "").trim();
  if (ben) {
    const hit =
      names.children.find((c) => c.id === ben) ||
      names.children.find((c) => c.name.toLowerCase() === ben.toLowerCase()) ||
      names.children.find((c) => givenName(c.name).toLowerCase() === givenName(ben).toLowerCase());
    if (hit) return givenName(hit.name) || hit.name;
    return givenName(ben) || ben;
  }
  const hay = (opts.name ?? "").toLowerCase();
  if (!hay) return null;
  let found: string | null = null;
  for (const c of names.children) {
    const g = givenName(c.name);
    if (g.length < 2) continue;
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(g.toLowerCase())}(?:[^a-z0-9]|$)`);
    if (re.test(hay) || hay.includes(c.name.toLowerCase())) {
      if (found && found.toLowerCase() !== g.toLowerCase()) return null;
      found = g;
    }
  }
  return found;
}

export function ownerOptions(names: HouseholdNames) {
  return [
    { value: "a", label: givenName(names.nameA) || names.nameA },
    { value: "b", label: givenName(names.nameB) || names.nameB },
    { value: "joint", label: "Joint" },
    ...names.children.map((c) => ({ value: `child:${c.id}`, label: givenName(c.name) || c.name })),
  ];
}
