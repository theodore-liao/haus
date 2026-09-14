# Cryptocurrencies

Cryptocurrencies is `/crypto`: wallet value, allocation, and the wallet grid. Addresses are entered here. Verification never pastes one.

## Sub-features

- `crypto-page` renders `/crypto`.
- `crypto-empty` shows `No wallets yet` when there are no wallets, lots, or brokerage crypto.

## How to get to it (user POV)

- Choose `Cryptocurrencies` in the left rail (`data-nav-href="/crypto"`).
- Open `/crypto`.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- Logged in via the helper.

- **Page.** Open crypto. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /crypto --expect-h1 Cryptocurrencies --ready-any "Wallet value|No wallets yet|Add wallet" --out crypto`. Pass: heading `Cryptocurrencies` and either a wallet value or `No wallets yet`.
- **Proof.** `artifacts/crypto/page.png`. Do not copy any address off the grid.

## Gotchas

- `Add wallet` opens a dialog that POSTs `/api/crypto-wallets`. Do not open it.
- `Sync` and `Sync wallets` write. Do not click them.
- `Remove` deletes a wallet.
