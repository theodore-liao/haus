# Transactions

Manage transactions lists ledger activity with search and column filters. Category and merchant edits write through.

## Sub-features

- `transactions-table` renders the table or `No transactions`.
- `transactions-search` filters by the search box (read-only).
- `transactions-empty` shows `No transactions` when nothing is linked.

## How to get to it (user POV)

- Choose `Manage transactions` in the left rail (`data-nav-href="/transactions"`).
- Open `/transactions`.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- Logged in via the helper.

- **Table.** Open the page. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /transactions --expect-h1 "Manage transactions" --ready-any "Search merchant, account, category|No transactions" --out transactions`. Pass: heading `Manage transactions` and either the search box plus a row count or the empty ledger.
- **Search.** Optional. Fill placeholder `Search merchant, account, category` with a generic letter. Do not open a row sheet. Do not press save.
- **Proof.** `artifacts/transactions/page.png`.

## Gotchas

- `Download view` hits `/api/export/transactions`. Do not click it.
- Opening a row can PATCH merchant/category. Leave rows unopened.
- The empty state offers Plaid. Do not connect.
