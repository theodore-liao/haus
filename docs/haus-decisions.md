# Haus decisions

Settled choices for how Haus looks and behaves. Each line was a correction at least once. Check every change against the lines for the pages it touches, and against the whole-app lines, before calling the change done.

## Design system

Sizes, spacing, and placement come from shared styles, not from each page. Use these before writing any `text-*`, padding, or width on a page. If none fits, add a role to `src/app/haus.css` and use it everywhere, rather than styling one page.

- Text roles live at the top of `src/app/haus.css`: page title, display hero (the one number a page is about), display (pills and card metrics), lead (page description), body, table, kicker (uppercase labels, card titles, table heads), and micro (footnotes, chips, axis ticks). Use `.kicker`, `.display-number`, `.supporting-line`, `.footnote`, and `.num` rather than picking a font size.
- Page header: `.page-title`, with the title and description on the left and page actions on the right.
- Card header: `CardHeader row`. The `CardTitle` and search box sit on the left, and date chips, tabs, filters, and action buttons sit on the right.
- Search: `SearchInput` from `src/components/search-input.tsx`. One size, trims on blur. Do not style an `Input` as a search box.
- Buttons: `Button` from `src/components/ui/button.tsx`, with its variants and sizes. Do not build buttons from plain elements.
- Dollar amounts: `Money`, so privacy blur and cents stay consistent. Owners: `OwnerTag`. Named things inside a card: `ObjectTitle`.
- Surfaces: `Card`, `.chart-card`, `.hero-card`, `.pill`, with spacing from `--space-card` and `--space-block`.
- Donuts: `AllocationChart` in `src/components/charts.tsx`, with the shared `.legend-row` grid. A page does not get its own legend columns.
- Tables: `.data-table`, where right-aligned figures use `.num` and two-line cells use `.cell-stack`.

## Whole app

- Reference display: 2560×1440 monitor, browser zoom 100%, Windows scale 100%, Haus text size 100%. Also check 1920×1080. Layout is relative; section boxes fill the width without zooming.
- Haus text size 100% equals the old 130%. The slider runs from 75% to 150%, and everything scales with it, including numbers inside donuts.
- Dollar amounts show cents. Do not round to whole dollars.
- Privacy blur covers dollar amounts only. Counts, dates, rates, and percents stay clear.
- Every button looks and acts like a button. It shows the hand cursor on hover, and only the button itself is clickable, not the row around it.
- Clicking outside a popup or modal closes it.
- No nested scroll bars. No horizontal scroll bar on any legend. If content does not fit, make room.
- Long names in one-line rows end with "…" instead of wrapping to a second line.
- Ownership labels (who owns an account or wallet) are faded subtext beside the name, not part of the same text.
- Labels and help text are short and plain. Say what it does in one sentence. No jargon, no stacked clauses, and no mention of what the app does not do.
- Nothing is hard-coded to a specific merchant, bank, card, ticker, coin, or person. Fixes must work for any household that links its own accounts.
- A new feature that changes how data is treated can be turned off in Settings.
- The repo contains no names, tickers, account details, property details, screenshots, or anything else unique to this household.
- A fix to one chart or page must not change another. Colors, legend layout, and spacing on untouched pages stay the same.

## Charts and donuts

- All donuts share one legend layout. The name is left-aligned in one column, the dollar amount is right-aligned in its own column, and the donut and legend sit centered in the box. This includes the spend donut.
- All donuts use one palette. Every category has a fixed color that stays the same when categories are checked, unchecked, or appear because of a new date range.
- Every donut legend can check and uncheck items, and the donut updates.
- Sankey colors are fixed per category, stay the same across reloads, and are clearly different from each other. Salary is not purple. The Salary bar has no extra "Income" label. "To savings" has no breakdown.
- Sankey label text is slightly larger than body chart text. The Sankey works on mobile.

## Date chips and search

- Date chips sit at the top right of the section, the same everywhere. One set of chips per view.
- Month chips cover exactly that calendar month, with no day from the prior month.
- Transactions offers the three most recent months, then 1M, 3M, 6M, 1Y, and All. It defaults to the current month, regardless of the default chart window.
- Scrolling to "Show more" in Transactions un-highlights the date chips once clicked.
- Stocks and crypto gainers and losers default to 1W. The default is set in Settings.
- Search bars sit at the top left, look identical everywhere (holdings, trades, crypto, transactions), and never cover a section title. Action buttons (Add connection, Add manual entry, Reset filters) stay on the right.
- Search trims leading and trailing spaces and matches every text field except dates.
- Row filters have Apply and Cancel at the bottom right.

## Overview

- Pills are Equities (every investment account), Cash, Property (homes, vehicles, and other non-cash assets), and Liabilities (total debt). They add up to household net worth.
- The four pills sit inside the right side of the Household net worth box. Day, week, and month change live in that box.
- Month-by-month shows every complete month plus the current one. Older months appear only when stored transaction history covers the whole month.

## Spending

- Tabs are Breakdown, Recurring, and Refunds. There is no Activity tab.
- The Spend Category box takes two thirds of the width, and Budget takes one third. The donut is large and has a fixed size that does not shrink when budget rows change.
- The top of Spend Category shows the checked-category total in the same font as the Overview net worth number, with total spend in smaller grey text directly beneath. There is no separate spending pill.
- Loan payments and Rent and utilities start unchecked.
- "Shopping" is the category name everywhere, not "General merchandise".
- Clicking a donut slice opens a large window. Merchant rows expand only when clicked, and they use the same transactions table as the Transactions page, so edits show everywhere immediately. Amounts there are positive and use the smaller grey sub-line style.
- Refunds shows the transactions table filtered to refunds in the chosen window, before netting against spending.
- Budget starts from each category's 3-month average. Rows are added by choosing a category from the dropdown, with no separate Add button. Editing needs an Edit button and a Save button. Each row shows percent used and dollars left or over. The header shows days left in the current month, and the budget scales with the date chip.

## Transactions

- Transfers between linked accounts are detected automatically when the same amount leaves one account and lands in another. There is no in/out distinction. It can be turned off in Settings.
- A matched transfer shows its label as small grey text beside the merchant, so row height stays the same. The warning reads: "The same amount landed in another linked account, so this is marked Transfer. If you recategorize, the auto-detected Transfer will be overwritten."
- Recategorizing a matched transfer, including with "Always categorize this merchant this way", applies to every matching transaction and overrides the automatic Transfer.
- Transactions can have a note. A small note icon shows on the row when one exists.
- Merchant logos come from a general source, not a hand-written list of merchants.
- Export lives in Settings and asks for a date range from a calendar.

## Stocks and crypto

- Largest moves on Stocks shows stocks only, and Crypto shows crypto only. Each shows up to seven gainers and seven losers.
- A window with price movement always has gainers and losers. Percent changes are sane and never come from a bad price.
- Day change is filled for every holding, including options and manually entered assets. It is computed from quantity and price change when the connection has not refreshed.
- Manual entries show "Last updated" with date and time. Edit and Remove sit at the right end of the account column. Edit reopens the entry window with values filled in, and Add becomes Save.
- The manual entry window clearly separates Ticker + shares from Name + dollar value. Ticker entries take cost per share, and dollar entries take total cost basis.
- Crypto holdings have no Cost or Total columns. "Manual Entries" is the name, not "Manual Lots".
- Crypto wallet boxes are all the same size, have no account-holder box, and can be renamed. The By-asset legend does not show an obtrusive scroll bar.

## Retirement, property, insights

- Retirement shows the Retirement accounts table and a growth projection to retirement age. Inputs (growth rate, annual contribution, retirement age) update on Enter and are saved across reloads. There is no donut. Birthdates are set in Settings.
- Property shows total equity with assets minus liabilities written underneath, with no separate real estate or vehicle pills. Vehicle boxes span the full width.
- Take-home pay annualized includes every household member's paychecks.

## Settings

- Crypto and Insurance start hidden. Retirement, Property, and Insights start shown. Enabling a tab inserts it at its default position unless it was dragged.
- Data section: "Auto label transfers" ("Automatically categorizes transactions as "Transfer" when money flows between connected accounts.") and "Store transaction history" ("Saves your transaction history directly in the app to bypass data limits set by certain banks connected through Plaid.").
- Under Store transaction history, show "Since <date>" for when it was first turned on. "Show saved transactions" lines up with the other data controls.
- Turning off Store transaction history asks for confirmation: "Warning: This permanently deletes your local transaction history. Turning this feature back on will not recover transactions that exceed your financial institution's download limits." Nothing else ever deletes stored history, including reloads, redeploys, and turning the feature off and on without confirming.
- Log out sits directly below the other settings, with no gap above it.

## Working on Haus

- Review Aurin's requested changes on the real household at `localhost:3000`, logged in with the real password from `.env`. Never copy real screenshots, numbers, or names into the repo, commits, or pull requests.
- Before editing a feature, run `npm run shots -- before --real` if port 3000 is up. After the change, run `npm run shots -- after --real` and `npm run shots:diff -- before after`. Look only at pages that changed, including ones you did not mean to touch. Screenshots stay in `.grok/shots/` and never go in git.
- Use a test household for cases the real one cannot show. `npm run demo -- full 3001` starts one on port 3001 with the password `demo-household`. `single` is one person, `empty` is a brand-new user, `random` is an extreme household from a seed. `npm run demo:seed -- full` resets the data. Stop the test server when done.
- The nightly bug-finding automation runs `npm run nightly-check`. That builds a random extreme household, checks every page, and shuts the server down. Local feature work does not run it.
- Check the browser console and the dev server log after every change, and fix what they show.
- Do not start `npm run dev` or `next dev`. Use Aurin's server on port 3000. Never touch port 3000. A hook stops anything left on ports 3001–3009 when the turn ends.
- When Aurin corrects something, add or update a line in this file in the same change.
