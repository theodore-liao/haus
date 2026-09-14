# Connections

Manage connections is `/connections`: linked institutions and account holders. Look only. Never link, relink, or remove.

## Sub-features

- `connections-list` renders the Connections card.
- `connections-empty` shows `No items linked` when nothing is linked.

## How to get to it (user POV)

- Choose `Manage connections` in the left rail (`data-nav-href="/connections"`).
- Open `/connections`.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- Logged in via the helper.

- **Look.** Open connections. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /connections --expect-h1 "Manage connections" --ready-any "Connections|No items linked|Add institution" --out connections`. Pass: heading `Manage connections` and the Connections card. Do not click `Add institution`, `Relink`, `Remove`, or any holder `<select>`.
- **Proof.** `artifacts/connections/page.png`. Do not print institution names, account names, or masks.

## Gotchas

- Chase Link starts with no accounts selected. That is product copy, not an invitation to click Link during verification.
- Holder dropdowns PATCH `/api/accounts/:id`. Changing one assigns a person on the live ledger.
- `Add institution` launches Plaid Link. The helper will abort the token POST if you click it anyway. Do not click it.
