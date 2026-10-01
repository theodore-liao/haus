import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, Delta } from "@/components/money";
import { HeroCard } from "@/components/hero-card";
import { ChartCard } from "@/components/chart-card";
import { SymbolPriceChart } from "@/components/symbol-price-chart";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getOverview, getSymbolDetail } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { holdingPeriodMove } from "@/lib/period-moves";
import { priceDayKey } from "@/lib/price-window";
import { isDust } from "@/lib/dust";
import { formatDate, formatPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SymbolPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { symbol } = await params;
  const fromCrypto = (await searchParams).from === "crypto";
  const back = fromCrypto ? { href: "/crypto", label: "Crypto" } : { href: "/investments", label: "Stocks" };
  const owner = await getOwnerFilter();
  const data = await getSymbolDetail(decodeURIComponent(symbol), owner);
  if (data.lots.length === 0 && data.trades.length === 0) notFound();
  const value = data.lots.reduce(
    (s, h) => s + ((h.quotePrice ?? h.institutionPrice) != null ? (h.quotePrice ?? h.institutionPrice)! * h.quantity : (h.institutionValue ?? 0)),
    0,
  );
  const qty = data.lots.reduce((s, h) => s + h.quantity, 0);
  const costed = data.lots.filter((h) => h.costBasis != null && h.costBasis > 0);
  const cost = costed.reduce((s, h) => s + (h.costBasis ?? 0), 0);
  const costedQty = costed.reduce((s, h) => s + h.quantity, 0);
  const costedValue = costed.reduce(
    (s, h) => s + ((h.quotePrice ?? h.institutionPrice) != null ? (h.quotePrice ?? h.institutionPrice)! * h.quantity : (h.institutionValue ?? 0)),
    0,
  );
  const gain = costed.length ? costedValue - cost : null;
  const moved = data.lots.filter((h) => h.quoteChange != null);
  let day = moved.length ? moved.reduce((s, h) => s + (h.quoteChange ?? 0) * h.quantity, 0) : null;
  let dayPct = moved[0]?.quoteChangePct ?? null;
  // A held asset with a price is never blank: with no stored day change, use the close about a day ago (0 at worst).
  const lastPrice = qty > 0 ? value / qty : 0;
  if (day == null && lastPrice > 0) {
    const sym = data.symbol.toUpperCase();
    const closes = new Map(data.prices.map((p) => [`${sym}|${priceDayKey(new Date(p.date))}`, p.close]));
    const m = holdingPeriodMove({ symbol: sym, value, last: lastPrice, days: 1, closes, now: new Date() });
    day = m.delta;
    dayPct = m.pct;
  }
  // From Crypto the share is of the crypto total; otherwise of the stocks total.
  const cryptoTotal = fromCrypto ? (await getOverview(owner)).allocation.crypto : 0;
  const weight = fromCrypto ? (cryptoTotal > 0 && value > 0 ? value / cryptoTotal : null) : data.stocksShare;
  const unit = fromCrypto ? { many: "coins", one: "a coin" } : { many: "shares", one: "a share" };

  return (
    <>
      <PageHeader
        title={data.symbol}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={back.href}>
              <ArrowLeft />
              {back.label}
            </Link>
          </Button>
        }
      />
      <HeroCard
        kicker={`${data.symbol} value`}
        supporting={
          <>
            <span className="num">{qty.toLocaleString()}</span> {unit.many}
            {costed.length ? (
              <>
                {" "}
                · Average cost <Money value={costedQty > 0 ? cost / costedQty : null} /> {unit.one} · Gain{" "}
                <Delta value={gain} pct={cost > 0 && gain != null ? (gain / cost) * 100 : null} />
              </>
            ) : null}
            {weight != null ? (
              <>
                {" "}
                · <span className="num">{formatPct(weight * 100, 1, false)}</span> of your {fromCrypto ? "crypto" : "stocks"}
              </>
            ) : null}
          </>
        }
        deltas={[{ label: "Day", value: day, pct: dayPct }]}
      >
        <Money value={value} />
      </HeroCard>
      <ChartCard kicker="Price">
        <SymbolPriceChart
          key={data.symbol}
          symbol={data.symbol}
          kind={data.history.kind}
          coingeckoId={data.history.coingeckoId}
          spot={data.history.spot}
          prices={data.prices}
        />
      </ChartCard>
      <Card>
        <CardHeader>
          <CardTitle>Holdings by account</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead className="num">Qty</TableHead>
                <TableHead className="num">Last</TableHead>
                <TableHead className="num">Value</TableHead>
                <TableHead className="num">Cost</TableHead>
                <TableHead className="num">Day</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.lots.map((h) => {
                const last = h.quotePrice ?? h.institutionPrice;
                const val = last != null ? last * h.quantity : h.institutionValue;
                // Near-zero lots are clutter; they still count in the totals above.
                if (isDust(val)) return null;
                return (
                  <TableRow key={h.id}>
                    <TableCell>
                      <span className="cell-stack">
                        <span>{h.account}</span>
                        <span>{h.institution}</span>
                      </span>
                    </TableCell>
                    <TableCell>{h.ownerLabel}</TableCell>
                    <TableCell className="num">{h.quantity}</TableCell>
                    <TableCell className="num">
                      <Money value={last} />
                    </TableCell>
                    <TableCell className="num">
                      <Money value={val} />
                    </TableCell>
                    <TableCell className="num text-muted-foreground">
                      <Money value={h.costBasis} />
                    </TableCell>
                    <TableCell className="num">
                      <Delta value={h.quoteChange != null ? h.quoteChange * h.quantity : null} pct={h.quoteChangePct} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Synced transactions</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="num">Qty</TableHead>
                <TableHead className="num">Price</TableHead>
                <TableHead className="num">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.trades.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    <span className="num">{formatDate(t.date)}</span>
                  </TableCell>
                  <TableCell className="capitalize">
                    {t.type}
                    {t.subtype && t.subtype.toLowerCase() !== t.type.toLowerCase() ? (
                      <span className="text-muted-foreground"> · {t.subtype}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{t.accountLabel}</TableCell>
                  <TableCell className="num">{t.quantity ?? "—"}</TableCell>
                  <TableCell className="num">
                    <Money value={t.price} />
                  </TableCell>
                  <TableCell className="num">
                    <Money value={t.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
