# Overview

Overview is the household home at `/`: net worth, allocation, and the cashflow block. There is no Cashflow tab in the rail.

## Sub-features

- `overview-home` renders `/` after login.
- `overview-empty` shows `No institutions connected` when the ledger has no items.

## How to get to it (user POV)

- Pass the lock. The app replaces to `/`.
- Choose `Overview` in the left rail (`data-nav-href="/"`).
- Open `/`.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- `HAUS_SITE_PASSWORD` is in the shell if the lock is shown.

- **Home.** Open Overview. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route / --expect-h1 Overview --ready-any "Household net worth|No institutions connected" --out overview`. Pass: `h1` is `Overview` and either the net worth hero or the empty ledger is visible. Tiles `Investments`, `Cash`, `Real estate`, `Liabilities` appear when the ledger is populated. Cashflow on a populated home is the `Where money moves` block on this same page.
- **Proof.** `artifacts/overview/page.png`.

## Gotchas

- There is no Cashflow rail item. `/cashflow` and `/reports` still redirect to `/`. Do not look for a tab.
- The empty state includes `Add institution`. Do not click it.
- Auto refresh on a stale sync is blocked by the helper. A toast about a failed refresh does not fail the page.
