"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RecurringBill } from "@/lib/recurring";
import type { WindowKey } from "@/lib/range";
import type { TxnRow } from "@/lib/txn-row";
import { RecurringPanel } from "./recurring";
import { TransactionsTable } from "./table";

/** A credit that is not pay, interest, or a transfer. Listed before spend is reduced by it. */
function isRefund(t: TxnRow) {
  if (t.amount >= 0 || t.isTransfer || t.isCcPayment) return false;
  const code = (t.category ?? "").toUpperCase();
  if (code === "TRANSFER" || code === "INCOME" || code.startsWith("INCOME_")) return false;
  return true;
}

export function TransactionsView({
  rows,
  recurring,
  removedCount,
  initialQuery,
  initialRange,
}: {
  rows: TxnRow[];
  recurring: RecurringBill[];
  /** Bills the household removed from Recurring, which Restore brings back. */
  removedCount: number;
  initialQuery: string;
  initialRange: WindowKey;
}) {
  const [tab, setTab] = useState("all");
  const refunds = useMemo(() => rows.filter((t) => !t.internal && isRefund(t)), [rows]);
  const tabs = (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="recurring">Recurring</TabsTrigger>
        <TabsTrigger value="refunds">Refunds</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (tab === "recurring") {
    // Same header row and gap as the table's, so the tabs never move between All, Recurring, and Refunds.
    return (
      <div>
        <div className="section-head txn-toolbar">{tabs}</div>
        <RecurringPanel recurring={recurring} rows={rows} removedCount={removedCount} />
      </div>
    );
  }
  if (tab === "refunds") {
    return (
      <TransactionsTable key="refunds" rows={refunds} dateChips defaultRange={initialRange} lead={tabs} />
    );
  }
  return <TransactionsTable key="all" rows={rows} dateChips initialQuery={initialQuery} defaultRange={initialRange} lead={tabs} />;
}
