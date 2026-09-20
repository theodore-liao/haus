"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money, HeroMetric } from "@/components/money";

function fv(pv: number, pmt: number, annual: number, years: number) {
  const r = annual / 12;
  const n = years * 12;
  if (r === 0) return pv + pmt * n;
  return pv * Math.pow(1 + r, n) + pmt * ((Math.pow(1 + r, n) - 1) / r);
}

export function Illustration({ starting }: { starting: number }) {
  const [monthly, setMonthly] = useState(1000);
  const [ret, setRet] = useState(6);

  const rows = useMemo(
    () =>
      [10, 20, 30].map((y) => ({
        years: y,
        value: fv(starting, monthly, ret / 100, y),
      })),
    [starting, monthly, ret],
  );

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Illustration, not advice</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          Nominal dollars. Constant monthly contribution and a constant annual return, compounded monthly. No inflation,
          fees, taxes, or sequence-of-returns. This is a calculator, not a recommendation.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Starting balance</Label>
            <div className="mt-1">
              <Money value={starting} />
            </div>
          </div>
          <div>
            <Label>Monthly contribution</Label>
            <Input
              className="mt-1"
              type="number"
              value={monthly}
              onChange={(e) => setMonthly(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Assumed annual return %</Label>
            <Input className="mt-1" type="number" value={ret} onChange={(e) => setRet(Number(e.target.value) || 0)} />
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {rows.map((r) => (
            <div key={r.years} className="rounded-md border border-border px-4 py-3">
              <HeroMetric label={`${r.years} years`}>
                <Money value={r.value} />
              </HeroMetric>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
