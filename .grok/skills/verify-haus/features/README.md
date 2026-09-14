# Haus verification map

This directory is the maintained source for verifying Haus office pages. Read this index, then drive the feature file that matches the route you changed.

## Baseline preconditions

- One live Haus on this desktop at `http://localhost:3000`.
- `node .grok/skills/verify-haus/scripts/doctor.mjs` reports `lock` or `office`.
- Reuse that process. Never spawn a second `next dev`.
- `HAUS_SITE_PASSWORD` is already in the shell when the lock is shown. Do not read `.env`.
- Playwright helper installed: `npm install --prefix .grok/skills/verify-haus/scripts`.
- Do not seed a household. Do not invent banks. Empty ledger copy is a valid pass.

## Driving conventions

- Start from doctor, then the feature recipe. Login is inside `drive.mjs` unless `--skip-login`.
- Prefer role, placeholder, nav `data-nav-href`, and the `h1` strings in SKILL.md.
- Treat every command as literal.
- Read-only. Mutation block is in SKILL.md Drive. Connections is look-only.
- Restore nothing. There is no disposable fixture. If you mutated the ledger, you failed the run.

## Proof and skip reporting

- Capture the resulting viewport, not only a pass boolean.
- UI proof is `artifacts/<id>/page.png` plus `report.json`.
- Do not quote names, masks, tokens, addresses, or dollar amounts from the screenshot.
- Record the feature id and route with every artifact.
- An unreachable path (lock with no password in the shell, no symbol link) is reported with the command and the unmet precondition. Do not mark it verified through a different page.

## Feature entry contract

Each file starts with an H1 and one paragraph. Then exactly four H2s: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-haus`, `Gotchas`.

## Pages

| Route | File |
| --- | --- |
| `/lock` | [Household lock](./lock.md) |
| `/` | [Overview](./overview.md) |
| `/cashflow` | [Overview](./overview.md) (legacy redirect, not a tab) |
| `/reports` | [Overview](./overview.md) (legacy redirect, not a tab) |
| `/spending` | [Spending](./spending.md) |
| `/transactions` | [Transactions](./transactions.md) |
| `/investments` | [Stocks](./investments.md) |
| `/investments/[symbol]` | [Stocks](./investments.md) |
| `/crypto` | [Cryptocurrencies](./crypto.md) |
| `/real-estate` | [Property](./property.md) (redirect) |
| `/property` | [Property](./property.md) |
| `/vehicles` | [Property](./property.md) (redirect) |
| `/retirement` | [Retirement](./retirement.md) |
| `/insurance` | [Insurance](./insurance.md) |
| `/children` | [Children](./children.md) |
| `/insights` | [Insights](./insights.md) |
| `/connections` | [Connections](./connections.md) |
| `/settings` | [Settings](./settings.md) |
