# Stocks

Stocks is `/investments`: manual entries, holdings, and trades. A symbol cell opens `/investments/[symbol]` with lots and synced transactions.

## Sub-features

- `investments-board` renders `/investments`.
- `investments-symbol` opens the first existing symbol link.
- `investments-empty` shows `No brokerage holdings` when there are no rows.

## How to get to it (user POV)

- Choose `Stocks` in the left rail (`data-nav-href="/investments"`).
- Open `/investments`.
- Click a Symbol link in Holdings.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- Logged in via the helper.
- Do not invent a ticker. Only follow a link the page already rendered.

- **Board.** Open stocks. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /investments --expect-h1 Stocks --ready-any "Holdings|Market value|Manual Entries|No brokerage holdings" --out investments`. Pass: heading `Stocks` and one of those strings.
- **Symbol.** From holdings, click the first `a[href^="/investments/"]`. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /investments --click-first-symbol --ready-any "Lots|Synced transactions" --out investments-symbol`. Pass: heading is no longer `Stocks`, `Lots` is visible, no `Not found`. If the helper exits with `no symbol link on /investments`, report `verified-unreachable` and keep the board screenshot. Do not type a symbol into the URL bar.
- **Proof.** `artifacts/investments/page.png`. Symbol proof is `artifacts/investments-symbol/page.png`.

## Gotchas

- `Add holdings` and `Add connection` write or open Plaid. Do not click them.
- Manual `Remove` on a lot deletes it.
- A made-up `/investments/XYZ` renders `Not found`. That is a fail, not an empty state.
