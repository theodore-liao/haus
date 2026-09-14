---
name: verify-haus
description: >
  Drive the Haus household wealth office at http://localhost:3000 the way a user
  does: reuse npm run dev, log in through the lock, open the changed office
  page, screenshot it, and pass only if the heading and main numbers or tables
  rendered with no error overlay. Never mutate the live ledger. Use after
  changing src/app/(office)/ or when the user runs /verify-haus.
---

# Verify Haus

Haus is a private Next.js household wealth office on this desktop. One ledger. Source only on GitHub. Verification drives that live instance in a throwaway browser. It does not invent a household or seed banks.

## Hard stops

- Do not read or write `.env`, `.env.*`, `*.db`, `prisma/*.db`, `/data`, or `/backups`.
- Do not print household names, account numbers, masks, Plaid tokens, or wallet addresses. Do not transcribe dollar amounts from screenshots into chat. Point at the artifact path.
- Do not click Plaid Link, Relink, Add institution, or reconnect anything.
- Do not start a second Next server to "isolate". Port 3000 and `prisma/dev.db` are the household. Two processes share the ledger.
- Do not kill by process name (`node.exe`, `next`). Kill only a pid this skill recorded.

## Launch

From the repo root.

1. `node .grok/skills/verify-haus/scripts/doctor.mjs`
2. If `state` is `lock` or `office`, reuse that process. Do not spawn another.
3. If `state` is `down`, `node .grok/skills/verify-haus/scripts/launch.mjs`. That runs `npm run dev` and waits until `http://localhost:3000/lock` answers with the Haus lock.
4. If `state` is `not-haus`, stop. Something else owns port 3000.

Ready: doctor exits 0. The lock heading is `Household lock` or the office heading is `Overview`.

`npm run dev` is the app command. `npm start` binds `127.0.0.1:3000` after a production build. Verification uses `next dev` on `http://localhost:3000`.

## Doctor

```
node .grok/skills/verify-haus/scripts/doctor.mjs
```

HTTP-only. No cookies, no `.env`, no database. Exit 0 and JSON `ok: true` with `state: "lock"` or `state: "office"` means drive it. Exit 1 with `down` or `not-haus` means do not.

If a drive looks off, run doctor again before retrying.

## Drive

```
node .grok/skills/verify-haus/scripts/drive.mjs --route <path> --expect-h1 "<heading>" --ready-any "<a>|<b>" --out <feature-id>
```

Exact commands live in `features/`. Run the matching file, not a nearby page.

Loop for a code change:

1. Reuse `npm run dev` if doctor says it is up.
2. Log in through `/lock` (the helper does this). Passphrase comes from `HAUS_SITE_PASSWORD` already in the shell. If the variable is missing, stop and ask the user to export it. Never open `.env`.
3. Open the page that changed.
4. Screenshot.
5. Pass when there is no error overlay and the main numbers or tables (or the documented empty ledger) rendered.
6. Do not mutate live ledger data.

The helper logs in with Playwright against Edge or Chrome, 1440x900 so the desktop nav rail is visible. It aborts every `POST`/`PUT`/`PATCH`/`DELETE` except `POST /api/auth/login`. That also blocks the office shell's automatic `POST /api/refresh`. `--ready-any` matches the needle as written or in uppercase, and also matches `placeholder` attributes, so CSS `uppercase` labels and search-box placeholders still pass.

Do not click, even if a control is visible:

| Control | Why |
| --- | --- |
| `Add institution`, `Relink` | Plaid Link |
| `Remove` on a connection, wallet, vehicle, property, or policy | deletes live data |
| `Refresh all` | Plaid sync |
| `Save names`, `Log out` | household settings / session |
| `Add wallet`, `Sync`, `Sync wallets` | chain writes |
| `Add holdings`, `Add property`, `Add vehicle`, `Add child`, `Add account`, `Add HSA` | ledger writes |
| transaction row save / category patch | ledger writes |
| insurance file upload | writes `/data` |
| `Download view` | exports the household |
| nav grip `Reorder …` | writes `localStorage` nav order |

Office routes live under `src/app/(office)/`. After login, reach them from the left rail (`data-nav-href`) or by URL.

| URL | Nav label | `h1` |
| --- | --- | --- |
| `/` | Overview | Overview |
| `/spending` | Spending | Spending |
| `/investments` | Stocks | Stocks |
| `/crypto` | Cryptocurrencies | Cryptocurrencies |
| `/retirement` | Retirement accounts | Retirement accounts |
| `/property` | Property | Property |
| `/insurance` | Insurance | Insurance |
| `/children` | Children | Children |
| `/insights` | Insights | Insights |
| `/connections` | Manage connections | Manage connections |
| `/transactions` | Manage transactions | Manage transactions |
| `/settings` | Settings | Settings |

Redirects (not rail tabs): `/cashflow` → `/`, `/reports` → `/`, `/real-estate` → `/property`, `/vehicles` → `/property`. Cashflow lives on Overview as `Where money moves`. `/investments/[symbol]` is reached by clicking a Symbol link on Holdings, never by inventing a ticker.

Lock selectors: heading `Household lock`, placeholder `Passphrase`, button `Enter`.

If browser tools are used instead of the helper, same routes, same selectors, same mutation block. Isolated profile only. Never the user's daily browser.

## Evidence

Write under `.grok/skills/verify-haus/artifacts/<feature-id>/`:

- `page.png` — viewport screenshot of the user-visible page after the action
- `report.json` — `pass`, `route`, `heading`, `emptyLedger`, `errorOverlay`, `blockedMutations`

Proof standard:

- Drive the real lock and office routes. No test-only endpoints, no Prisma writes, no mocked Plaid.
- Capture the resulting screen, not an internal setter.
- Pass: no heading `This page could not be loaded`, no `Not found`, no `[data-nextjs-dialog]` / `[data-nextjs-error-overlay]`, `h1` matches, and one `--ready-any` string is visible. `nextjs-portal` in dev is not an error. Empty ledger headings (`No institutions connected`, `No wallets yet`, …) are a pass. They mean the page rendered against this household, not that data is missing from a seed.
- Fail: error overlay, heading mismatch, ready text missing, or doctor not-ok.
- `report.json` must not contain names, masks, tokens, or addresses.

Chat writeup names the feature id, the command, pass/fail, and the screenshot path. It does not quote the screenshot.

## Cleanup

```
node .grok/skills/verify-haus/scripts/cleanup.mjs
```

Kills the pid in `artifacts/run.json` only when `startedByUs` is true. Leaves a reused `npm run dev` running. Deletes `run.json`. Leaves every `artifacts/*/page.png` and `report.json` in place.

If a drive fails, run cleanup before the next launch attempt so a stale pid is not stranded. Then confirm the screenshot for the failed attempt is still on disk.

## Helpers

Install once:

```
npm install --prefix .grok/skills/verify-haus/scripts
```

| Script | When |
| --- | --- |
| `scripts/doctor.mjs` | before the first drive, and whenever the instance looks wrong |
| `scripts/launch.mjs` | only if doctor reports `down` |
| `scripts/drive.mjs` | each mapped feature |
| `scripts/cleanup.mjs` | end of the run, and after a failed launch |

`playwright-core` lives in `scripts/`. It uses installed Edge or Chrome. Do not add Playwright to the Haus app `package.json`.
