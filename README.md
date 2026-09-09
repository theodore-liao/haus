# Haus

Private household wealth office. One ledger, two people. Not a consumer budgeting app.

The Next.js process on the household desktop is the source of truth. SQLite and insurance files stay on that machine. Optional Cloudflare Tunnel + Access can put a private HTTPS door in front later. Deploying code does not recreate the database.

This repository is **source only**. The live ledger, ID cards, Plaid tokens, wallet addresses, and household names never belong on GitHub.

## Stack

Next.js App Router, TypeScript, Tailwind CSS, Prisma + SQLite, Plaid Link, Recharts, TanStack Table.

## Local run

```bash
cd haus
cp .env.example .env
# set HAUS_SITE_PASSWORD, HAUS_SESSION_SECRET (32+ chars), HAUS_TOKEN_KEY
npx prisma migrate dev --name init
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The household lock is the first screen.

Generate `HAUS_TOKEN_KEY` once and keep it forever (rotating it makes stored Plaid tokens unreadable):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite, e.g. `file:./dev.db` (relative to `prisma/`) |
| `HAUS_SITE_PASSWORD` | Household lock passphrase |
| `HAUS_SESSION_SECRET` | Signed session cookie secret (32+ characters) |
| `HAUS_TOKEN_KEY` | AES key for Plaid `access_token`s. Do not rotate. |
| `ALLOWED_EMAILS` | Comma-separated Cloudflare Access emails. Empty for local `next dev`. |
| `HAUS_PUBLIC_URL` | Public HTTPS origin if you put a tunnel in front |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | One pair for the household |
| `PLAID_ENV` | `sandbox` \| `development` \| `production` |
| `PLAID_PRODUCTS` | `transactions,investments,liabilities` |
| `FINNHUB_API_KEY` | Optional live equity quotes |

Do not commit `.env`.

## Plaid

One `PLAID_CLIENT_ID` for the household. Production Trial is **10 Items per client**, shared. An Item is one login at one institution, not one account.

Both people link their own banks in Plaid Link inside this same app. Do not create a second Plaid developer account.

`PLAID_ENV=production` must match production keys.

## What is not in this app

- No CSV import
- No demo / seed household
- No trading, transfers, or bill pay
- No chatbot
- No light theme
- No public signup
- No bank passwords, crypto seeds, or private keys

## Insurance documents

Declarations pages, ID cards, and benefit summaries (jpg / png / webp / pdf) are stored under `data/insurance/` on the machine that runs Haus. Files are served only after a session check.

## GitHub

This is a public source backup. Never commit:

- `.env` / `.env.*` / `.dev.vars`
- `*.db` and Prisma SQLite files
- `/data` (insurance screenshots, ID cards)
- `/backups`
- wallet addresses, account numbers, Plaid tokens, household names

`.gitignore` covers those. Before every push, run `git status` and confirm none of the above are staged.

The live database stays on the desktop. Use `npm run backup` and copy `backups/` to another drive.

## Optional: Cloudflare Tunnel + Access

Keep Next.js + SQLite on a machine that stays on. Cloudflare is only the door.

```bash
npm run build
npm start
```

`npm start` binds `127.0.0.1:3000`.

1. Named tunnel, public hostname → `http://127.0.0.1:3000`.
2. Access app on that hostname, One-time PIN, allow two emails.
3. Then set `ALLOWED_EMAILS` and `HAUS_PUBLIC_URL` and restart.

Do not recreate D1/R2 or a new empty `dev.db` on deploy. Schema changes: `npx prisma migrate deploy`.

## Scripts

```bash
npm run dev          # next dev
npm run build
npm start            # 127.0.0.1:3000 only
npm run backup       # copy SQLite + insurance into /backups
npx prisma migrate dev
npx prisma studio
```
