# Retirement

Retirement accounts is `/retirement`: combined balances and boards for 401(k), IRA, Roth, 403(b), and HSA.

## Sub-features

- `retirement-page` renders `/retirement`.
- `retirement-empty` shows `No retirement accounts` or `Nothing classified as retirement`.

## How to get to it (user POV)

- Choose `Retirement accounts` in the left rail (`data-nav-href="/retirement"`).
- Open `/retirement`.

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- Logged in via the helper.

- **Page.** Open retirement. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /retirement --expect-h1 "Retirement accounts" --ready-any "combined balances in this filter|No retirement accounts|Nothing classified as retirement" --out retirement`. Pass: heading `Retirement accounts` and one of those strings.
- **Proof.** `artifacts/retirement/page.png`.

## Gotchas

- `Add HSA` opens a manual HSA form that POSTs. Do not click it.
- Empty-with-connections (`Nothing classified as retirement`) is still a pass. It means the page rendered.
