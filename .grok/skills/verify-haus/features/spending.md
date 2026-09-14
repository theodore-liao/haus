# Spending

Spending is category mix, activity, recurring charges, and refunds built from the ledger. It is not a budget.

## Sub-features

- `spending-mix` shows the Mix tab with a spending total and `By category`.
- `spending-activity` switches to the Activity table.
- `spending-recurring` switches to Recurring.
- `spending-refunds` switches to Refunds.
- `spending-empty` shows `No spend yet` when nothing is linked.

## How to get to it (user POV)

- Choose `Spending` in the left rail (`data-nav-href="/spending"`).
- Open `/spending`.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- Logged in via the helper.

- **Page.** Open spending. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /spending --expect-h1 Spending --ready-any "By category|No spend yet|Mix" --out spending`. Pass: heading `Spending` and either Mix/`By category` or `No spend yet`.
- **Activity tab.** After the page pass, in the same kind of drive, click the tab named `Activity` only if Mix rendered. Do not save transaction edits. A second screenshot may go to `artifacts/spending-activity/page.png` if you are proving that tab.
- **Proof.** `artifacts/spending/page.png`.

## Gotchas

- Mix is the default tab. Activity reuses the transactions table. Opening a row and saving a merchant is a ledger write. Do not.
- Range chips change the window in memory only. Leave them on the default.
