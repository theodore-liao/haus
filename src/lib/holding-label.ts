// A short label for a holding. A real ticker (VOO, QQQM, BRK.B) is the clearest name; the ids that
// 401(k) plans use for their funds (MRMSPI, VANG.500.INDEX.TRUST) are not, so those show the fund's name.
const TICKER = /^[A-Z]{1,5}([.-][A-Z])?$/;

export function holdingLabel(h: { symbol?: string | null; name?: string | null }): string {
  const symbol = (h.symbol ?? "").trim();
  const name = (h.name ?? "").trim();
  if (symbol.toUpperCase().startsWith("CUR:")) return "Cash";
  if (TICKER.test(symbol)) return symbol;
  return name || symbol || "Holding";
}
