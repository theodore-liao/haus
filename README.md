# Haus

Household finance app. Next.js, Prisma, and SQLite on the machine that runs it. One site password unlocks the household.

Pages: Overview, Spending, Stocks, Crypto, Retirement, Property, Insurance, Insights, Connections (Plaid), Transactions, Settings. Crypto and insurance start hidden; turn them on in Settings. Retirement, property, and insights start on.

Spending has date chips and a category donut, plus recurring and refunds. Transactions use the same date chips, with search, notes, and categories. Settings can keep posted transactions in the local SQLite database, match transfers between linked accounts, and set default chart and movers windows.

Insurance files live under `data/insurance/` on that machine. `npm run backup` copies the database and insurance files into `backups/`.

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

Generate `HAUS_TOKEN_KEY` once and keep it (rotating it makes stored Plaid tokens unreadable):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite, e.g. `file:./dev.db` (relative to `prisma/`) |
| `HAUS_SITE_PASSWORD` | Household lock passphrase |
| `HAUS_SESSION_SECRET` | Signed session cookie secret (32+ characters) |
| `HAUS_TOKEN_KEY` | AES key for Plaid `access_token`s |
| `ALLOWED_EMAILS` | Comma-separated Cloudflare Access emails. Empty for local `next dev`. |
| `HAUS_PUBLIC_URL` | Public HTTPS origin if you put a tunnel in front |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | One pair for the household |
| `PLAID_ENV` | `sandbox` \| `development` \| `production` |
| `PLAID_PRODUCTS` | `transactions,investments,liabilities` |
| `FINNHUB_API_KEY` | Optional live equity quotes |

`.gitignore` covers `.env`, SQLite files, `/data`, and `/backups`.

## Plaid

One `PLAID_CLIENT_ID` for the household. Production Trial allows 10 Items per client, shared. An Item is one login at one institution. Both people link banks in Plaid Link in this app. `PLAID_ENV=production` must match production keys.

## Optional: Cloudflare Tunnel + Access

Keep Next.js + SQLite on a machine that stays on. Cloudflare is the door.

```bash
npm run build
npm start
```

`npm start` binds `127.0.0.1:3000`.

1. Named tunnel, public hostname → `http://127.0.0.1:3000`.
2. Access app on that hostname, One-time PIN, allow the household emails.
3. Set `ALLOWED_EMAILS` and `HAUS_PUBLIC_URL` and restart.

Schema changes on that machine: `npx prisma migrate deploy`.

## Scripts

```bash
npm run dev          # next dev
npm run build
npm start            # 127.0.0.1:3000 only
npm run backup       # copy SQLite + insurance into /backups
npx prisma migrate dev
npx prisma studio
```
