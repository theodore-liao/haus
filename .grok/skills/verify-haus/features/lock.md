# Household lock

The lock is the first screen on `http://localhost:3000`. A correct passphrase sets the `haus_session` cookie and replaces the view with Overview. A wrong passphrase stays on the lock with `Denied.`

## Sub-features

- `lock-render` shows the Haus lock form.
- `lock-enter` submits the passphrase and lands on Overview.
- `lock-denied` keeps the lock visible after a wrong passphrase.

## How to get to it (user POV)

- Open `http://localhost:3000` with no session cookie.
- Open `/lock` directly.
- Use Settings `Log out` (do not do that during verification).

## Driving it with verify-haus

Preconditions:

- Doctor reports `lock` or `office`.
- For `lock-enter`, `HAUS_SITE_PASSWORD` is set in this shell.

- **Render.** Open the lock without logging in. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route /lock --expect-h1 "Household lock" --ready-any "Enter the household passphrase." --skip-login --out lock`. Pass: heading `Household lock`, placeholder `Passphrase`, button `Enter`, no error overlay.
- **Enter.** Log in and land on Overview. Run `node .grok/skills/verify-haus/scripts/drive.mjs --route / --expect-h1 Overview --ready-any "Household net worth|No institutions connected" --out lock-enter`. Pass: heading `Overview`.
- **Denied.** Do not drive this in a loop. One wrong guess is enough to know the copy exists. Skip unless you are specifically proving the error path. Never log the passphrase.
- **Proof.** `artifacts/lock/page.png` shows the lock brand and form. `artifacts/lock-enter/page.png` shows Overview.

## Gotchas

- The passphrase field has no accessible name, only placeholder `Passphrase`.
- `POST /api/auth/login` is the one mutating-looking call the helper allows. Everything else is aborted.
- A session already in the Playwright context skips the lock and goes to Overview. That is still a pass for `lock-enter`.
- Do not read `.env` to obtain the passphrase.
