# Haus

Haus keeps a household's money in one place. Balances, spending, and where money moves sit together, so the accounts you connect are visible without opening each institution on its own. One passphrase unlocks the household.

Haus runs on your own computer. Your data stays on it.

## Plaid

Haus uses Plaid to read balances and transactions from your banks, cards, and brokerages. Sign up before the rest of the setup, so you have the keys when you fill in `.env`.

1. Create an account at [https://dashboard.plaid.com/signup](https://dashboard.plaid.com/signup).
2. In the Plaid dashboard, open **Keys**. Copy the client ID and the production secret. Production keys work after Plaid enables production on the account. The sandbox secret only connects to Plaid's fake test banks.
3. Leave the products as `transactions,investments,liabilities` unless you want a shorter list. Haus always requests transactions. Investments and liabilities attach when the selected accounts support them.

One client ID covers the household. On a Production Trial, that client holds 10 institution logins maximum, shared.

## Set up Haus

### 1. Install Node.js

Node.js is the program that runs Haus.

1. Go to [https://nodejs.org](https://nodejs.org).
2. Download the **LTS** installer and open it.
3. Click Next (Continue on a Mac) through the installer and leave every choice as it is.

### 2. Get the Haus folder

1. On the Haus page on GitHub, click the green **Code** button, then **Download ZIP**.
2. Unzip it. On Windows, right-click the file and choose **Extract All**. On a Mac, double-click it.
3. Move the unzipped folder somewhere you will find it, like Documents. Keep the name `haus`.

### 3. Open a terminal in the folder

- **Windows:** open the `haus` folder in File Explorer. Click the address bar, type `cmd`, and press Enter.
- **Mac:** open **Terminal**. Type `cd ` with a space after it, drag the `haus` folder onto the Terminal window, and press Return.

Keep this window for the next steps.

### 4. Install what Haus needs

```bash
npm install
```

This takes a few minutes. Wait until you can type again.

### 5. Set your passphrase and Plaid keys

Haus reads its settings from a file called `.env`. Make it from the example file:

- **Windows:**

  ```bash
  copy .env.example .env
  notepad .env
  ```

- **Mac:**

  ```bash
  cp .env.example .env
  open -e .env
  ```

Change these lines. Keep the quote marks (`"`) around each value:

- `HAUS_SITE_PASSWORD`: the passphrase you will type to unlock Haus.
- `HAUS_SESSION_SECRET`: a long string of at least 32 letters and numbers. You will never type it again.
- `HAUS_TOKEN_KEY`: another long string of at least 32 letters and numbers. **Write it down and never change it.** It locks your saved bank connections, and a new one cannot unlock the old ones.
- `PLAID_CLIENT_ID` and `PLAID_SECRET`: the values you copied from Plaid.
- `PLAID_ENV`: `production` for real banks, or `sandbox` for fake test banks. It has to match the secret you pasted.

Save the file and close the window.

### 6. Build Haus and start it

```bash
npm run build
npm start
```

Building takes a few minutes. When `npm start` is running, leave the window open. Haus stops if you close it.

On Windows, a box may ask whether to let the app through the firewall. Choose **Allow access**.

### 7. Open Haus

Open your browser and go to [http://localhost](http://localhost). Type your passphrase.

Sign in, open **Connections**, and choose **Add institution**. One session covers banks, cards, and brokerages. Some institutions start with no accounts selected, so check every account you want included.

### Next time

- **Windows:** open the `haus` folder, then the `scripts` folder, and double-click `start-haus.cmd`. Leave the window open while you use Haus.
- **Mac:** do step 3, then type `npm start`.

To stop Haus, click its window and press Control and C, or close the window.

If you change `.env` later, or get new code, stop Haus, then run `npm run build` and `npm start` again.

### If something goes wrong

- **`'npm' is not recognized` or `command not found: npm`:** Node.js is not installed yet, or this window was open before you installed it. Close the window, open a new one with step 3, and try again. If it still fails, restart the computer.
- **Haus says to set `HAUS_SITE_PASSWORD`:** the passphrase line in `.env` is empty or was not saved. Fix it, save, and start Haus again.
- **The passphrase is refused:** it has to match `.env` exactly, with the same capital letters. After 5 wrong tries Haus waits 15 minutes before it lets you try again.
- **You forgot the passphrase:** open `.env`, type a new one, save, and start Haus again.
- **The browser cannot connect, or Haus says port 80 is in use:** another program is using that address. Close it, or run `npx next start -p 8080` instead and open [http://localhost:8080](http://localhost:8080).
- **A bank won't connect:** Haus shows Plaid's message with a code in brackets, like `(INSTITUTION_NOT_RESPONDING)`. The same line is in the Haus window, starting with `[plaid link]`. Pass that code on when asking for help. Try from a computer rather than a phone: some banks send you to their own sign-in page, and that works best on a computer.
- **Anything else:** copy the last red lines from the window into a message to whoever set Haus up for you.

### Open it from another computer at home

`npm start` also answers other computers on your home network, on the web's standard port, so the address needs no number after it. On the other computer, open `http://YOUR-PC-NAME` (the name Windows shows under Settings, System, About) and enter the same passphrase. Phones often cannot look up a computer's name; use its home-network address instead, like `http://10.0.0.25`. This computer has to be on with Haus running.

Windows blocks this until the home network is marked Private and port 80 is allowed on private networks. Open the Start menu, type PowerShell, right-click it, and choose Run as administrator. Then paste:

```powershell
Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Private
New-NetFirewallRule -DisplayName "Haus (home network)" -Direction Inbound -Protocol TCP -LocalPort 80 -Profile Private -Action Allow
```

Only do the first line on your own home network, not on public Wi-Fi. Do not forward port 80 on your router: Haus is meant for the home network, not the internet.

`npm run dev` still runs on [http://localhost:3000](http://localhost:3000), so it can run beside the built app.

### While changing Haus's code

`npm run dev` runs a development server instead. It reloads as you edit, but it is slower: each page compiles the first time you open it, and every page carries extra checks. Use it only while working on the code, then go back to `npm run build` and `npm start`.

## Environment

- `DATABASE_URL` — local database file. The example `file:./dev.db` is relative to the `prisma/` folder. `npm run build` creates it.
- `HAUS_SITE_PASSWORD` — passphrase for the household lock. Required to sign in.
- `HAUS_SESSION_SECRET` — signs the login cookie. Use at least 32 characters. A local run still starts when this is empty, using a built-in dev secret.
- `HAUS_TOKEN_KEY` — encrypts saved Plaid connection tokens. Generate it once and keep it. A production build requires it.
- `PLAID_CLIENT_ID` — client ID from the Plaid Keys page. Required to connect institutions.
- `PLAID_SECRET` — secret for the same Plaid environment. Required to connect institutions.
- `PLAID_ENV` — `production` (default) for real banks, or `sandbox` for fake test banks. Match it to the secret.
- `PLAID_PRODUCTS` — comma-separated products. Defaults to `transactions,investments,liabilities`.
- `FINNHUB_API_KEY` — optional live stock quotes. Holdings still show quantity, value, and cost basis from the connected accounts.
