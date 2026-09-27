export type AssetIdentity = { chain: string; tokenKey: string };

/**
 * Which stored rows a scan may delete.
 * A chain that did not answer is not confirmed, so its rows stay.
 * `keepTokens` entries are exact token keys, or prefixes when they end with ":".
 */
export function assetIdsToDrop(
  existing: { id: string; chain: string; tokenKey: string }[],
  incoming: AssetIdentity[],
  confirmedChains: Iterable<string>,
  keepTokens: Iterable<string> = [],
): string[] {
  const confirmed = new Set(confirmedChains);
  const hold = [...keepTokens];
  const keep = new Set(incoming.map((a) => `${a.chain}:${a.tokenKey}`));
  return existing
    .filter((row) => {
      if (!confirmed.has(row.chain)) return false;
      if (keep.has(`${row.chain}:${row.tokenKey}`)) return false;
      if (hold.some((p) => (p.endsWith(":") ? row.tokenKey.startsWith(p) : row.tokenKey === p))) return false;
      return true;
    })
    .map((row) => row.id);
}
