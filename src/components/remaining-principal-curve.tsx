"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  addMonths,
  amortize,
  isoMonth,
  originalPrincipal,
  remainingFromPayment,
} from "@/lib/amortization";
import { formatMoney } from "@/lib/format";

type Props = {
  principal: number;
  rate: number | null;
  monthlyPi: number;
  originationDate?: string | Date | null;
  originalTermMonths?: number | null;
};

const ICE = "#7EB6E0";
const TEAL = "#6FC4B0";
const ROSE = "#D48992";
const GOLD = "#CBB892";
const MUTED = "#8FA0B8";
const GRID = "rgba(148,163,184,0.14)";

type PlotlyMod = typeof import("plotly.js-dist-min").default;

export function RemainingPrincipalCurve({
  principal: principal0,
  rate: rate0,
  monthlyPi: pi0,
  originationDate,
  originalTermMonths,
}: Props) {
  const mainEl = useRef<HTMLDivElement>(null);

  const model = useMemo(() => {
    const remainingNow = Number(principal0) || 0;
    const apr = Number(rate0) || 0;
    const pi = pi0;
    const nLeft = remainingFromPayment(remainingNow, apr, pi);
    if (remainingNow <= 0 || nLeft <= 0 || pi <= 0) return null;

    const today = new Date();
    let elapsed = 0;
    let start = new Date(today.getFullYear(), today.getMonth(), 1);
    let originalN = nLeft;
    if (originationDate) {
      start = new Date(originationDate);
      elapsed = Math.max(0, (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()));
      originalN = Math.max(nLeft + elapsed, originalTermMonths ?? nLeft + elapsed);
    } else if (originalTermMonths && originalTermMonths > nLeft) {
      elapsed = originalTermMonths - nLeft;
      start = addMonths(today, -elapsed);
      originalN = originalTermMonths;
    }

    const origP = originalPrincipal(remainingNow, apr, originalN, elapsed);
    const scheduled = amortize({
      principal: origP,
      aprPct: apr,
      remainingMonths: originalN,
      start,
    });
    if (!scheduled) return null;

    const x = [isoMonth(start), ...scheduled.months.map((m) => isoMonth(addMonths(start, m.i + 1)))];
    const remaining = [origP, ...scheduled.months.map((m) => m.balance)];
    let paidP = 0;
    let paidI = 0;
    const principalPaid = [0];
    const interestPaid = [0];
    for (const m of scheduled.months) {
      paidP += m.principal;
      paidI += m.interest;
      principalPaid.push(paidP);
      interestPaid.push(paidI);
    }
    const todayIso = isoMonth(today);
    const last = x.length - 1;
    const keep = x
      .map((iso, i) => i)
      .filter((i) => {
        const mo = Number(x[i].slice(5, 7));
        return i === 0 || i === last || x[i] === todayIso || mo === 1 || mo === 7;
      });
    const pick = <T,>(arr: T[]) => keep.map((i) => arr[i]);
    const xs = pick(x);
    const rem = pick(remaining);
    const pPaid = pick(principalPaid);
    const iPaid = pick(interestPaid);
    const yMax = Math.max(origP, pPaid[pPaid.length - 1] ?? 0, iPaid[iPaid.length - 1] ?? 0) * 1.08;
    return {
      pi,
      n: nLeft,
      x: xs,
      remaining: rem,
      principalPaid: pPaid,
      interestPaid: iPaid,
      todayIso,
      yMax,
      x0: xs[0],
      x1: xs[xs.length - 1],
    };
  }, [principal0, rate0, pi0, originationDate, originalTermMonths]);

  useEffect(() => {
    if (!model || !mainEl.current) return;
    let dead = false;
    let Plotly: PlotlyMod | null = null;
    const el = mainEl.current;

    void (async () => {
      Plotly = (await import("plotly.js-dist-min")).default;
      if (dead || !mainEl.current) return;
      const axis = {
        gridcolor: GRID,
        zeroline: false,
        tickfont: { size: 11, color: MUTED },
        linecolor: "transparent",
      };
      const line = (name: string, y: number[], color: string, fill: string) => ({
        x: model.x,
        y,
        name,
        type: "scatter" as const,
        mode: "lines" as const,
        line: { color, width: 2.4, shape: "spline" as const },
        fill: "tozeroy" as const,
        fillcolor: fill,
        hoveron: "points" as const,
        hovertemplate: `${name}: %{y:$,.0f}<extra></extra>`,
        hoverinfo: "x+y+name" as const,
      });
      const traces = [
        line("Remaining principal", model.remaining, ICE, "rgba(126,182,224,0.22)"),
        line("Principal paid", model.principalPaid, TEAL, "rgba(111,196,176,0.22)"),
        line("Interest paid", model.interestPaid, ROSE, "rgba(212,137,146,0.22)"),
        {
          x: [null, null, null] as (number | null)[],
          y: [null, null, null] as (number | null)[],
          mode: "markers" as const,
          type: "scatter" as const,
          name: "cursor",
          showlegend: false,
          hoverinfo: "skip" as const,
          marker: {
            size: 11,
            color: [ICE, TEAL, ROSE],
            line: { width: 2, color: "#0b1320" },
          },
        },
      ];
      const gd = mainEl.current;
      await Plotly.react(
        gd,
        traces as never,
        {
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          font: { color: MUTED, family: "var(--font-geist-sans)" },
          margin: { t: 36, r: 16, b: 44, l: 58 },
          legend: { orientation: "h", y: 1.08, font: { size: 11 } },
          hovermode: "x unified",
          uirevision: "mortgage-curve",
          spikedistance: -1,
          xaxis: {
            ...axis,
            type: "date",
            tickformat: "%Y",
            hoverformat: "%b %Y",
            dtick: "M12",
            range: [model.x0, model.x1],
            autorange: false,
            fixedrange: true,
            automargin: false,
            showspikes: true,
            spikemode: "across",
            spikesnap: "data",
            spikecolor: MUTED,
            spikethickness: 1,
            spikedash: "dot",
          },
          yaxis: {
            ...axis,
            tickprefix: "$",
            tickformat: "~s",
            separatethousands: true,
            range: [0, model.yMax],
            autorange: false,
            fixedrange: true,
            automargin: false,
          },
          shapes: [
            {
              type: "line",
              x0: model.todayIso,
              x1: model.todayIso,
              y0: 0,
              y1: 1,
              yref: "paper",
              line: { color: GOLD, width: 1.6, dash: "dot" },
            },
          ],
          annotations: [
            {
              x: model.todayIso,
              y: 1,
              yref: "paper",
              text: "Today",
              showarrow: false,
              yanchor: "top",
              xanchor: "left",
              xshift: 8,
              yshift: -2,
              font: { size: 11, color: GOLD },
            },
          ],
          hoverlabel: {
            bgcolor: "#1c2a42",
            bordercolor: "rgba(196,210,228,0.18)",
            font: { size: 12, color: "#eef3f9", family: "var(--font-geist-sans)" },
          },
        } as never,
        { displayModeBar: false, responsive: true },
      );

      const node = gd as unknown as HTMLElement & {
        on: (ev: string, fn: (e: { points?: { pointIndex?: number }[] }) => void) => void;
        removeAllListeners: (ev: string) => void;
      };
      node.removeAllListeners?.("plotly_hover");
      node.removeAllListeners?.("plotly_unhover");
      node.on("plotly_hover", (e) => {
        const i = e.points?.[0]?.pointIndex;
        if (i == null || !Plotly) return;
        void Plotly.restyle(
          gd,
          {
            x: [[model.x[i], model.x[i], model.x[i]]],
            y: [[model.remaining[i], model.principalPaid[i], model.interestPaid[i]]],
          } as never,
          [3],
        );
      });
      node.on("plotly_unhover", () => {
        if (!Plotly) return;
        void Plotly.restyle(gd, { x: [[null, null, null]], y: [[null, null, null]] } as never, [3]);
      });
    })();

    return () => {
      dead = true;
      void import("plotly.js-dist-min").then((m) => {
        if (el) m.default.purge(el);
      });
    };
  }, [model]);

  if (!principal0) return null;

  return (
    <div className="mt-5 space-y-3">
      <div className="text-sm">
        P&amp;I <span className="font-mono tabular-nums text-accent">{model ? formatMoney(model.pi) : "—"}</span>
        <span className="text-muted-foreground"> · remaining </span>
        <span className="font-mono tabular-nums">
          {model ? `${Math.floor(model.n / 12)} yr ${model.n % 12} mo` : "—"}
        </span>
      </div>
      <div ref={mainEl} className="h-[320px] w-full" />
    </div>
  );
}
