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
- Number inputs: `NumberField` from `src/components/number-field.tsx`, on a `.field-grid`. The label sits above, `$` or `%` sits inside the box, and one line of help or a short error sits below. A choice between a few options is `Segmented` from the same file.
- A tool's answer: `.hero-figure` for its one number, `.meter` for progress, `.callout` for what to do next (green when on track, gold when behind, red when it cannot work).
- Dollar amounts inside a sentence use the sans font (`.callout`, `.field-note`, `.prose-num`). Tables and legends keep mono.

## Whole app

- Reference display: 2560×1440 monitor, browser zoom 100%, Windows scale 100%, Haus text size 100%. Also check 1920×1080. Layout is relative; section boxes fill the width without zooming.
- Haus text size 100% equals the old 130%. The slider runs from 75% to 150%, and everything scales with it, including numbers inside donuts.
- Dollar amounts show cents. Do not round to whole dollars. The exception is projections (the Retirement planner's forecasts): they round to what they can claim, like $2.48M or $49,100, with `Money approx`. Real balances and the "?" working keep cents.
- Privacy blur covers dollar amounts only. Counts, dates, rates, and percents stay clear.
- The eye button beside HAUS (and in the phone header) turns the blur on and off. It stays in step with the Settings switch.
- Removing a connection, a recurring bill, or an insurance card asks first.
- The phone bar shows the first three tabs in the sidebar order. The More sheet can pin any tab to the bar.
- Every button looks and acts like a button. It shows the hand cursor on hover, and only the button itself is clickable, not the row around it.
- Clicking outside a popup or modal closes it. Help under a box is one short line at 13px; anything longer goes behind a "?" beside the label (`InfoTip`, or `info` on `NumberField`). Explanations open from a "?" button in a `Popover` (src/components/ui/popover.tsx).
- No nested scroll bars. No horizontal scroll bar on any legend. If content does not fit, make room.
- Long names in one-line rows end with "…" instead of wrapping to a second line.
- Ownership labels (who owns an account or wallet) are faded subtext beside the name, not part of the same text.
- Labels and help text are short and plain. Say what it does in one sentence. No jargon, no stacked clauses, and no mention of what the app does not do.
- Nothing is hard-coded to a specific merchant, bank, card, ticker, coin, or person. Fixes must work for any household that links its own accounts.
- A new feature that changes how data is treated can be turned off in Settings.
- The repo contains no names, tickers, account details, property details, screenshots, or anything else unique to this household.
- Every page opens with its main summary card at the top. New tools go below it, never above.
- Cards side by side are the same height. If their content differs a lot, stack them instead.
- A card's result is its most prominent element: larger, and colored where color carries meaning (progress, gain, loss). Inputs are quieter and sit in aligned rows on a shared grid.
- Number boxes apply when you press Enter or leave the box, never mid-typing, so results and charts don't jump while you type. No separate apply button. Sliders and switches apply as you move them. While a box holds something not yet applied, a small "Enter to apply" hint shows inside the box; the help under it stays put, so nothing below moves while typing. Leaving a box by clicking applies it only after that click lands, so the click never misses a control that shifts.
- Numbers inside inputs are formatted with commas and at most two decimals.
- A result that is waiting on an input says which one, beside the result. It never shows $0.00 as if that were the answer.
- Every card answers "what should I do next?" on screen: a next step, a warning, or a clear "you're on track".
- A fix to one chart or page must not change another. Colors, legend layout, and spacing on untouched pages stay the same.

## Charts and donuts

- All donuts share one legend layout. The name is left-aligned in one column, the dollar amount is right-aligned in its own column, and the donut and legend sit centered in the box. This includes the spend donut.
- All donuts use one palette. Every category has a fixed color that stays the same when categories are checked, unchecked, or appear because of a new date range.
- Every donut legend can check and uncheck items, and the donut updates.
- Sankey colors are fixed per category, stay the same across reloads, and are clearly different from each other. Salary is not purple. The Salary bar has no extra "Income" label. Clicking an income or spending portion, including Other categories, opens the same merchant window as a spend donut slice: rows expand to transactions, and a transaction opens the same sidebar as Transactions. To savings has no breakdown. From savings only notes that spending exceeded income.
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

- Pills are Investments (every investment account, including crypto and brokerage cash), Cash, Property (homes, vehicles, and other non-cash assets), and Liabilities (total debt). They add up to household net worth.
- The four pills sit inside the right side of the Household net worth box. Day, week, and month change live in that box.
- Month-by-month shows every complete month plus the current one. Older months appear only when stored transaction history covers the whole month.
- Needs attention sits directly under the net worth box. It lists connections to relink or that have not synced in 48 hours, wallets that failed to sync, cards at 30% or more of their limit, categories over budget this month, unusual recent charges, and insurance renewing within 60 days. With nothing to show it says "Nothing needs attention."
- An unusual charge is one from the last 7 days at least twice the merchant's usual amount and $100 above it, or a first charge from a merchant larger than 95% of the last 90 days of charges. Review opens Transactions searched for that merchant.
- The Net worth chart shows the change over the chosen range above the chart. Net and Split chips sit beside the range chips; Split draws assets, liabilities, and net worth.
- Cashflow is one card with its date chips in the header, the Income, Spending, and Net Movement figures, then the Sankey.
- Month by month has a savings-rate line above the table. The open month is marked "so far". With three or more complete months, the best and lowest months by amount saved are marked. Spend vs last year shows only when the same month a year earlier is on file. Phones show Month, Spend, and Saved.

## Spending

- Tabs are Breakdown, Recurring, and Refunds. There is no Activity tab.
- The Spend Category box takes two thirds of the width, and Budget takes one third. The donut is large and has a fixed size that does not shrink when budget rows change.
- The top of Spend Category shows the checked-category total in the same font as the Overview net worth number, with total spend in smaller grey text directly beneath. There is no separate spending pill.
- Loan payments and Rent and utilities start unchecked.
- "Shopping" is the category name everywhere, not "General merchandise".
- Clicking a donut slice opens a large window. Merchant rows expand only when clicked, and they use the same transactions table as the Transactions page, so edits show everywhere immediately. Amounts there are positive and use the smaller grey sub-line style.
- Refunds shows the transactions table filtered to refunds in the chosen window, before netting against spending.
- Budget starts from each category's 3-month average. Rows are added by choosing a category from the dropdown, with no separate Add button. Editing needs an Edit button and a Save button. Each row shows percent used and dollars left or over. The header shows days left in the current month, and the budget scales with the date chip.
- In the current month, each budget bar has a tick for how much of the month has gone. A bar turns red when over budget and amber (with "ahead of pace") when the share spent is more than 10 points past that tick. Otherwise it keeps the category color.
- The spend donut legend shows each category's change against the earlier period, left of the dollar amount: the month before for a month chip (up to the same day while the month is open), or the same length of time before a rolling chip. Up is red, down is green, and "new" means no spend then. There is no comparison for All, or when stored history does not reach back far enough. A line under the total says what it compares with. Other donuts do not show changes.
- The category window shows that category month by month above the merchants, with a dashed average of the complete months. The open month is faded.
- Recurring opens with Per month, Per year, and Price changes figures, and sorts by Amount or Next due. Each bill shows its latest charge, the next expected date, and "up from" or "down from" the previous charge when the price moved by at least 2% and 50 cents.

## Transactions

- Transfers between linked accounts are detected automatically when the same amount leaves one account and lands in another. There is no in/out distinction. It can be turned off in Settings.
- A matched transfer shows its label as small grey text beside the merchant, so row height stays the same. The warning reads: "The same amount landed in another linked account, so this is marked Transfer. If you recategorize, the auto-detected Transfer will be overwritten."
- Recategorizing a matched transfer, including with "Always categorize this merchant this way", applies to every matching transaction and overrides the automatic Transfer.
- Transactions can have a note. A small note icon shows on the row when one exists.
- Merchant logos come from a general source, not a hand-written list of merchants.
- Export lives in Settings and asks for a date range from a calendar.

## Stocks and crypto

- Largest moves on Stocks shows stocks only, and Crypto shows crypto only. Each shows up to seven gainers and seven losers.
- Stocks opens with Market value, its day change, and cost basis and gain. When one holding is more than 15% of the stocks total, a note under the By account and By class donuts names it.
- Below the summary, By account is on the left and By class on the right, above the concentration note. Under the note, Value and Largest moves share one row at equal width on screens 1536px and wider, and stack on narrower screens so the amounts fit. There is no dividends card.
- 1W and 1M compare today's price with a close from about that long ago, with a few days of slack for weekends. When stored daily prices do not reach the last few days, they are filled in before those moves are shown, so 1W is never a repeat of 1D.
- A symbol page opens with that holding's value, shares, average cost, gain, share of the stocks total, and day change, then its price chart. A Stocks button at the top right goes back.
- A window with price movement always has gainers and losers. Percent changes are sane and never come from a bad price.
- Day change is filled for every holding, including options and manually entered assets. It is computed from quantity and price change when the connection has not refreshed.
- Manual entries show "Last updated" with date and time. Edit and Remove sit at the right end of the account column. Edit reopens the entry window with values filled in, and Add becomes Save.
- The manual entry window clearly separates Ticker + shares from Name + dollar value. Ticker entries take cost per share, and dollar entries take total cost basis.
- Crypto holdings show Cost and Total only once some coin has a cost: a manual entry's own cost, or an average cost per coin entered with the Average cost button on the Holdings card. "Manual Entries" is the name, not "Manual Lots".
- The Crypto summary card is "Crypto value" and covers wallets, brokerage crypto, and manual entries. Like Stocks, it shows day change, and cost basis and gain once costs exist, saying how many holdings have a cost.
- The Crypto page renders from stored prices and never waits on the price feed. After it loads it asks for fresh prices (at most every five minutes) and redraws only if something changed.
- A "Wallets" heading sits above the wallet boxes.
- Crypto wallet boxes are all the same size, have no account-holder box, and can be renamed. The By-asset legend does not show an obtrusive scroll bar.

## Retirement, property, insights

- Retirement, top to bottom: the Retirement summary card; Retirement Accounts (two thirds) beside Child Accounts (one third), the same height; the Retirement planner last. There is no What money becomes card. There is no donut and no separate Projection card. Birthdates are set in Settings; without them the planner works in years from now.
- The Retirement planner is one card with no duplicate inputs. It opens with a one-sentence verdict ("You can retire at 55 spending $80,000 a year" or "You're about $13,800 a year short…", with what the current saving could do instead). Under it, the Retirement number (with progress and what it pays for) comes first, and beside it "Saving toward it": Needed and You save now as two bars on one scale with the gap (ahead or short) underneath, since one only means something against the other. Then "What would change it": retire a year later, spend $5,000 less, save $10,000 more, each with its exact effect and applied in one click. Then two checks as short pills above the chart, each opening its explanation: weak markets (growth and after-retiring return 2 points lower), and, when retiring before 59½, whether money outside retirement accounts covers the years until then. On screens 1536px and wider the answer spans the card, with What would change it as its third column; then the retire slider, whose-age choice, and check pills share one full-width row (the pills stack from the top-left of the side column, Weak markets first, so nothing moves while the slider is dragged); below that the chart sits beside Spend and Assumptions, which run about as tall as the chart, and Kids takes the full width underneath with its list of children beside the amounts. No column should run far past the one next to it. Narrower, everything stacks, with Spend beside Kids from 1280px. While the planner waits on an input, there are no check pills, and a placeholder says what the chart will show.
- Needed a year is a result, never an input. It compounds at the growth rate net of inflation and is in today's money, so the dollar amount rises with prices. Kid costs above today's (a new child, college) come out of each year's saving, and a child leaving home adds back. Saving it lands exactly on the retirement number at the retire age. One growth rate covers cash and investments, and one tax rate covers withdrawals.
- You save now is regular take-home pay (bonuses dropped) minus all current spending, plus this year's retirement contributions, annualised. A "?" beside it opens the full working: each paycheck source with its amount and rhythm, spending over its months and the scale factor with the loan payments inside it, and contributions so far. A box under it takes the household's own yearly figure; blank uses the estimate, and the box offers the estimate back.
- Retire at is a slider from the current age plus one to 65. Without birthdates it is "Retire in N years", the page assumes one fixed age today (40) and says so, and the slider moves only the retirement year.
- The planner chart runs from today to 80 when the money lasts for good, or to the spend-down age. Your path (what you save now) is the solid blue main line with a faint weak-to-strong-markets band; the target path (the least that reaches the number) is gold and dashed. The gap between them is green where you're ahead and red where you're behind. Markers show retiring, the house, other income starting, and Medicare; the retirement number is a dotted line labelled in a margin right of the plot, and the band's weak and strong edges are labelled there too, only when they are apart and off the axis; no label sits on a line. Saving stops at retirement; after that the balance pays spending and keeps its returns, and the page says so when it keeps growing. Under the chart, one row per child shows years at home and college on the same years. A "Today's dollars | Future dollars" choice in the planner card's header switches the chart, the Retirement number and its breakdown ("Retirement number, in 2045 dollars", with the other figure beside it); today's dollars is the default. Yearly saving always shows in today's dollars and says so.
- There are no milestones; the chart and the yearly bars answer when the money gets where.
- There is no first-year withdrawal percentage.
- Spend a year starts at current yearly spending without loan payments (a house is planned as a cash purchase), and says so under the box.
- Under the Spend heading, one line says every amount is entered in today's prices and raised with inflation. The house, health cover and college boxes each show what their amount becomes in the year it's spent.
- The planner works in today's money throughout: every amount entered (spending, kid and college costs, health cover, the house, other income, your own saving) is in today's prices and rises with inflation; growth becomes a real return. Ages count in whole years from the current age, so a part-year age never drops a child's year.
- The retirement number uses invested money (cash plus investments, less child accounts, editable, with net worth beside it), yearly spending, children, health cover until Medicare at 65 (default $20,000 a year), an optional house, and optional other income, tax, and a return after retiring. Lasting for good is priced with each year's money withdrawn at the start of the year, so the line stays flat. Money lasts forever is the default. A checkbox switches to spending it down, and only then asks for the age. Each child costs $25,000 a year through 17 and $70,000 a year for college from 18 through 21. Child-account balances reduce college. Inflation defaults to 3%.
- Boxes apply on Enter or leaving the box, and everything is saved across reloads. A save the server refuses or that fails says so in a toast where the person is working; nothing fails silently. Coming back with the browser's Back button reloads the planner, so it never shows (or saves over) older inputs. The planner holds up to 12 children, matching what household settings accept; at 12 the Add button gives way to a note. Planned birth years run up to 40 years ahead. A box holding something unusable says why under it and is not applied. Optional amounts (other income, house) can be left blank.
- Kids say both halves: before retiring, how much new kid and college costs take out of saving and in which years (Needed a year already allows for it); after retiring, how much of the number is set aside for their costs still running then, with those years, in the same dollars as the number. Never say kids "add" money.
- Kids and the house each say what they add to the number, including when that is nothing because the cost falls before retiring. The house sits in Spend; it is bought the year you retire by default (a checked box that follows the slider), and unchecking it asks for the age.
- The planner's inputs are grouped as Spend (invested, spending, health cover, house, and spend-down), an always-visible Assumptions (growth, inflation, return after retiring, tax on withdrawals, other income and when it starts), and Kids. No assumption is hidden behind a dropdown. Invested is rounded to the nearest $10,000 and follows cash and investments (less child accounts) until the household types its own figure; a link then offers the live total back.
- Property shows total equity with assets minus liabilities written underneath, with no separate real estate or vehicle pills. Vehicle boxes span the full width.
- Take-home pay annualized includes every household member's paychecks, whether the bank labels them Paychecks or Salary.

## Settings

- Crypto and Insurance start hidden. Retirement, Property, and Insights start shown. Enabling a tab inserts it at its default position unless it was dragged.
- Data section: "Auto label transfers" ("Automatically categorizes transactions as "Transfer" when money flows between connected accounts.") and "Store transaction history" ("Saves your transaction history directly in the app to bypass data limits set by certain banks connected through Plaid.").
- Under Store transaction history, show "Since <date>" for when it was first turned on. "Show saved transactions" lines up with the other data controls.
- Turning off Store transaction history asks for confirmation: "Warning: This permanently deletes your local transaction history. Turning this feature back on will not recover transactions that exceed your financial institution's download limits." Nothing else ever deletes stored history, including reloads, redeploys, and turning the feature off and on without confirming.
- Log out sits directly below the other settings, with no gap above it.

## Working on Haus

- Review Aurin's requested changes on the real household at `localhost:3000`, logged in with the real password from `.env`. Never copy real screenshots, numbers, or names into the repo, commits, or pull requests.
- Before editing a feature, run `npm run shots -- before --real` if port 3000 is up. After the change, run `npm run shots -- after --real` and `npm run shots:diff -- before after`. Look only at pages that changed, including ones you did not mean to touch. Screenshots stay in `.grok/shots/` and never go in git.
- Use a test household for cases the real one cannot show. `npm run demo -- full 3001` starts one on port 3001 with the password `demo-household`. `empty` is a brand-new user; UX reviews use only `full` (3001) and `empty` (3002). `single` (one person) and `random` (an extreme household from a seed) exist for specific bugs. `npm run demo:seed -- full` resets the data. Stop the test servers when done.
- The nightly bug-finding automation runs `npm run nightly-check`. That builds a random extreme household, checks every page, and shuts the server down. Local feature work does not run it.
- Check the browser console and the dev server log after every change, and fix what they show.
- Any change to how a page looks or behaves passes `npm run ux` and the `ux-critic` subagent before it is reported done (see `CLAUDE.md` or `.cursor/rules/ux-review.mdc`, and `docs/ux-checklist.md`).
- A page view never waits on something it doesn't need: no fixed pauses unless a download actually happened, outside prices cached (15 minutes, including symbols with no data), and slow key derivation done once. Tabs open in well under a second on the dev server; if one takes seconds, profile it before adding features.
- Day to day, Haus runs as a built app (`npm run build`, then `npm start`); `npm run dev` is for changing code.
- Do not start `npm run dev` or `next dev`. Use Aurin's server on port 3000. Never touch port 3000. A hook stops anything left on ports 3001–3009 when the turn ends.
- When Aurin corrects something, add or update a line in this file in the same change.
