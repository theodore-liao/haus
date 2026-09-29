# Haus

Haus keeps a household's money in one place. Balances, spending, and where money moves sit together, so the accounts you connect are visible without opening each institution on its own. One passphrase unlocks the household.

## Set up locally

Install Node.js if you do not already have it. It includes npm.

From this folder:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to a new file named `.env` in the same folder.

3. Open `.env` and set `HAUS_SITE_PASSWORD` to the passphrase you will type on the household lock screen. The copied `DATABASE_URL` is already set for a local database file. The other names are listed under Environment.

4. Create the database:

   ```bash
   npm run db:migrate
   ```

5. Build the app and start it:

   ```bash
   npm run build
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000) and enter the passphrase.

This is how to run Haus day to day: a built app opens each page quickly. When you change `.env`, or pull new code, stop it and run both commands again.

### While changing Haus's code

`npm run dev` runs a development server instead. It reloads as you edit, but it is slower: each page compiles the first time you open it, and every page carries extra checks. Use it only while working on the code, then go back to `npm run build` and `npm start`.

## Plaid

1. Create an account at [https://dashboard.plaid.com/signup](https://dashboard.plaid.com/signup).
2. In the Plaid dashboard, open Keys. Copy the client ID and the production secret. Production keys work after Plaid enables production on the account. There is also a sandbox secret, which only connects to Plaid's fake test banks.
3. Put them in `.env`:

   ```
   PLAID_CLIENT_ID="your-client-id"
   PLAID_SECRET="your-secret"
   PLAID_ENV="production"
   ```

   `PLAID_ENV` is `production` for real banks, which is also what Haus uses when it is not set. Use `sandbox` only to try fake test banks. It has to match the secret you pasted, because a sandbox secret and a production secret are different values.

4. Leave `PLAID_PRODUCTS` as `transactions,investments,liabilities` unless you want a shorter list. The app always requests transactions. Investments and liabilities attach when the selected accounts support them.

5. Set `HAUS_TOKEN_KEY` before you link an institution, and keep that value. It encrypts the connection tokens stored in the local database. Generate one with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Keep the same value. A new key cannot read tokens saved with the old one.

6. Save `.env`, then stop the app and run `npm run build` and `npm start` again.

7. Sign in, open Connections, and choose Add institution. One session covers banks, cards, and brokerages. Some institutions start with no accounts selected, so check every account you want included.

One `PLAID_CLIENT_ID` covers the household. On a Production Trial, that client holds 10 institution logins maximum, shared.

## Environment

- `DATABASE_URL` — local database file. The example `file:./dev.db` is relative to the `prisma/` folder.
- `HAUS_SITE_PASSWORD` — passphrase for the household lock. Required to sign in.
- `HAUS_SESSION_SECRET` — signs the login cookie. Use at least 32 characters. A local run still starts when this is empty, using a built-in dev secret.
- `HAUS_TOKEN_KEY` — encrypts saved Plaid connection tokens. Generate it once and keep it. A production build requires it.
- `PLAID_CLIENT_ID` — client ID from the Plaid Keys page. Required to connect institutions.
- `PLAID_SECRET` — secret for the same Plaid environment. Required to connect institutions.
- `PLAID_ENV` — `production` (default) for real banks, or `sandbox` for fake test banks. Match it to the secret.
- `PLAID_PRODUCTS` — comma-separated products. Defaults to `transactions,investments,liabilities`.
- `FINNHUB_API_KEY` — optional live stock quotes. Holdings still show quantity, value, and cost basis from the connected accounts.
