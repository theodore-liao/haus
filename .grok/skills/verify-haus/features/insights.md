# Insights

Insights is `/insights`: derived cards (liquidity, portfolio, insurance, activity) plus a hotel-cost scratch pad.

## Sub-features

- `insights-page` renders `/insights`.
- `insights-empty` shows `No signals yet`.

## How to get to it (user POV)

- Choose `Insights` in the left rail (`data-nav-href="/insights"`).
- Open `/insights`.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- Logged in via the helper.

- **Page.** Open insights. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /insights --expect-h1 Insights --ready-any "Baller hotels|No signals yet|Not enough history" --out insights`. Pass: heading `Insights` and one of those strings.
- **Proof.** `artifacts/insights/page.png`.

## Gotchas

- `Baller hotels` is local React state. Changing nightly rate does not write the ledger. Leave the defaults.
- Empty with no connections is `No signals yet`. Sparse history is `Not enough history in this filter to form a card.` Both pass.
