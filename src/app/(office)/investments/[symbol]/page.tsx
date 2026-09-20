import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, Delta } from "@/components/money";
import { Pills, Pill } from "@/components/pills";
import { getSymbolDetail } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SymbolPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const owner = await getOwnerFilter();
  const data = await getSymbolDetail(decodeURIComponent(symbol), owner);
  if (data.lots.length === 0 && data.trades.length === 0) notFound();
  const value = data.lots.reduce((s, h) => s + (h.quotePrice ?? h.institutionPrice ?? 0) * h.quantity, 0);
  const qty = data.lots.reduce((s, h) => s + h.quantity, 0);
  const cost = data.lots.reduce((s, h) => s + (h.costBasis ?? 0), 0);

  return (
    <>
      <PageHeader title={data.symbol} />
      <Pills>
        <Pill kicker="Quantity" accent="#A898CC">
          {qty.toLocaleString()}
        </Pill>
        <Pill kicker="Value" accent="#7EABD4">
          <Money value={value} />
        </Pill>
        <Pill kicker="Cost basis" accent="#D4BE7A">
          <Money value={cost} />
        </Pill>
      </Pills>
      <Card>
        <CardHeader>
          <CardTitle>Lots</CardTitle>
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
                <TableHead className="num">Day P/L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.lots.map((h) => {
                const last = h.quotePrice ?? h.institutionPrice;
                const val = last != null ? last * h.quantity : h.institutionValue;
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
