function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fold(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Wealthfront + Individual Investment Account → Wealthfront: Individual Investment Account.
 *  Robinhood + Robinhood Roth IRA → Robinhood: Roth IRA. */
export function accountLabel(name: string, institution: string | null | undefined): string {
  const inst = (institution ?? "").trim();
  const raw = (name ?? "").trim();
  if (!inst) return raw || "Account";
  if (!raw) return inst;

  const instFold = fold(inst);
  const nameFold = fold(raw);
  if (!instFold) return raw;
  if (nameFold === instFold) return inst;

  let rest = raw;
  const prefix = new RegExp(`^${escapeRe(inst).replace(/\\s+/g, "[\\s\\-–—]*")}[\\s:–—\\-]*`, "i");
  if (nameFold.startsWith(instFold)) {
    rest = raw.replace(prefix, "").trim();
  }

  const colon = rest.match(/^([^:]+):\s*(.*)$/);
  if (colon && fold(colon[1]) === instFold) rest = colon[2].trim();

  if (!rest || fold(rest) === instFold) return inst;
  return `${inst}: ${rest}`;
}
