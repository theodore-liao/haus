import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTransactions } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { formatDate, formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireSession();
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to || !isDay(from) || !isDay(to)) {
    return NextResponse.json({ error: "Choose a start and end date." }, { status: 400 });
  }
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const owner = await getOwnerFilter();
  const rows = (await getTransactions(owner)).filter((r) => {
    const day = r.date.slice(0, 10);
    return day >= start && day <= end;
  });
  const header = ["Date", "Merchant", "Account", "Holder", "Category", "Amount", "Pending"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        formatDate(r.date),
        csv(r.merchant),
        csv(r.account),
        csv(r.ownerLabel),
        csv(categoryLabel(r.category)),
        formatMoney(r.amount),
        r.pending ? "pending" : "",
      ].join(","),
    ),
  ];
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="haus-transactions-${start}-${end}.csv"`,
    },
  });
}

function isDay(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function csv(v: string) {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replaceAll('"', '""')}"`;
  return v;
}
