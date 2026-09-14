import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, Delta } from "@/components/money";
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Quantity" text={qty.toLocaleString()} />
        <Stat label="Value" money={value} />
        <Stat label="Cost basis" money={cost} />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Lots</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Last</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Day P/L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.lots.map((h) => {
                const last = h.quotePrice ?? h.institutionPrice;
                const val = last != null ? last * h.quantity : h.institutionValue;
                return (
                  <TableRow key={h.id}>
                    <TableCell>
                      {h.account}
                      <div className="text-xs text-muted-foreground">{h.institution}</div>
                    </TableCell>
                    <TableCell>{h.ownerLabel}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{h.quantity}</TableCell>
                    <TableCell className="text-right">
                      <Money value={last} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={val} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={h.costBasis} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Delta value={h.quoteChange != null ? h.quoteChange * h.quantity : null} pct={h.quoteChangePct} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="mt-4">
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
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.trades.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono tabular-nums">{formatDate(t.date)}</TableCell>
                  <TableCell>
                    {t.type} {t.subtype ?? ""}
                  </TableCell>
                  <TableCell>{t.accountLabel}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{t.quantity ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Money value={t.price} />
                  </TableCell>
                  <TableCell className="text-right">
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

function Stat({ label, money, text }: { label: string; money?: number; text?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-xl font-medium">
        {text ?? <Money value={money} />}
      </CardContent>
    </Card>
  );
}
