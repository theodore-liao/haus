// Builds a made-up household in its own SQLite file so agents can check Haus without real data.
// Usage: node scripts/demo-seed.mjs [full|single|empty|random] [seed]
// "random" builds an extreme household from the seed number; the same seed always builds the same household.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const PROFILES = ["full", "single", "empty", "random"];
const profile = process.argv[2] ?? "full";
if (!PROFILES.includes(profile)) {
  console.error(`Unknown profile "${profile}". Use one of: ${PROFILES.join(", ")}.`);
  process.exit(1);
}
const randomSeed = Number(process.argv[3] ?? Math.floor(Math.random() * 1e9));

const root = path.resolve(import.meta.dirname, "..");
const dbFile = path.join(root, "prisma", `demo-${profile}.db`);
const url = `file:./demo-${profile}.db`;

for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  if (existsSync(dbFile + suffix)) rmSync(dbFile + suffix);
}
execFileSync(process.execPath, [path.join(root, "node_modules", "prisma", "build", "index.js"), "db", "push", "--skip-generate"], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: url },
  stdio: "ignore",
});

const prisma = new PrismaClient({ datasourceUrl: url });

let seed = profile === "random" ? randomSeed >>> 0 : 20260927;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = (list) => list[Math.floor(rand() * list.length)];
const round2 = (n) => Math.round(n * 100) / 100;

const today = new Date();
today.setHours(12, 0, 0, 0);
function daysAgo(n) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d;
}

let txnSeq = 0;
async function investmentTxn(account, securityId, dayOffset, name, type, amount, quantity) {
  txnSeq += 1;
  await prisma.investmentTxn.create({
    data: {
      plaidInvestmentTxnId: `demo-inv-${txnSeq}`,
      accountId: account.id,
      securityId,
      date: daysAgo(dayOffset),
      name,
      type,
      subtype: type === "buy" ? "buy" : "contribution",
      quantity,
      amount: round2(amount),
      price: quantity ? round2(amount / quantity) : null,
      isoCurrency: "USD",
    },
  });
}
function txn(accountId, dayOffset, name, amount, primary, detailed, extra = {}) {
  txnSeq += 1;
  return {
    plaidTransactionId: `demo-txn-${txnSeq}`,
    accountId,
    date: daysAgo(dayOffset),
    name,
    merchantName: extra.merchantName ?? name,
    amount: round2(amount),
    pending: extra.pending ?? false,
    categoryPrimary: primary,
    categoryDetailed: detailed,
    memo: extra.memo ?? null,
  };
}

async function linkedAccounts(owner, rows) {
  const item = await prisma.plaidItem.create({
    data: {
      itemId: `demo-item-${owner}-${rows[0].key}`,
      accessToken: "demo-not-a-token",
      institutionName: rows[0].institution,
      products: JSON.stringify(["transactions", "investments", "liabilities"]),
      defaultOwner: owner,
      lastSyncedAt: today,
    },
  });
  const out = {};
  for (const r of rows) {
    out[r.key] = await prisma.account.create({
      data: {
        plaidAccountId: `demo-acct-${r.key}`,
        itemId: item.id,
        name: r.name,
        mask: r.mask,
        type: r.type,
        subtype: r.subtype,
        hausType: r.hausType,
        owner: r.owner ?? owner,
        isRetirement: Boolean(r.retirementKind),
        retirementKind: r.retirementKind ?? null,
        currentBalance: r.balance,
        availableBalance: r.available ?? r.balance,
        limitAmount: r.limit ?? null,
        previousBalance: r.previous ?? r.balance,
        interestRate: r.rate ?? null,
        lastSyncedAt: today,
      },
    });
  }
  return out;
}

async function holding(account, symbol, name, type, qty, price, dayPct, costPerShare) {
  const security = await prisma.security.upsert({
    where: { plaidSecurityId: `demo-sec-${symbol}` },
    create: { plaidSecurityId: `demo-sec-${symbol}`, symbol, name, type, closePrice: price, closePriceAsOf: today },
    update: {},
  });
  const change = round2((price * dayPct) / (100 + dayPct));
  await prisma.holding.create({
    data: {
      sourceKey: `demo-hold-${account.id}-${symbol}`,
      accountId: account.id,
      securityId: security.id,
      symbol,
      name,
      type,
      quantity: qty,
      costBasis: round2(qty * costPerShare),
      institutionValue: round2(qty * price),
      institutionPrice: price,
      quotePrice: price,
      quoteChange: change,
      quoteChangePct: dayPct,
      quoteAsOf: today,
    },
  });
  await priceHistory(symbol, price, dayPct);
}

// Daily closes ending at today's price, so Haus never reaches out for history.
const historyWritten = new Set();
async function priceHistory(symbol, price, dayPct) {
  if (!(price > 0) || historyWritten.has(symbol)) return;
  historyWritten.add(symbol);
  const rows = [];
  let close = price;
  for (let i = 0; i <= 400; i++) {
    const d = daysAgo(i);
    d.setHours(0, 0, 0, 0);
    const weekday = d.getDay() !== 0 && d.getDay() !== 6;
    if (weekday) rows.push({ symbol, date: d, close: round2(close), source: "demo" });
    if (i === 0) close = price / (1 + dayPct / 100);
    else if (weekday) close = close * (1 + (rand() - 0.49) * 0.03);
  }
  await prisma.pricePoint.createMany({ data: rows });
}

async function seedFull({ single }) {
  await prisma.household.create({
    data: {
      id: "haus",
      nameA: "Alex Rivera",
      nameB: single ? "Two" : "Sam Rivera",
      birthdateA: new Date("1990-04-12"),
      birthdateB: single ? null : new Date("1991-09-03"),
      showCrypto: true,
      showInsurance: true,
      keepTransactions: true,
      transactionsStoredSince: daysAgo(40),
      budgetsSeeded: true,
    },
  });
  if (!single) {
    const riley = await prisma.child.create({ data: { name: "Riley Rivera" } });
    // The planner keeps birth years; Settings edits them alongside the names.
    await prisma.household.update({
      where: { id: "haus" },
      data: { projectionPrefs: JSON.stringify({ planChildren: [{ id: riley.id, name: riley.name, birthYear: 2019, planned: false }] }) },
    });
  }

  const bank = await linkedAccounts("a", [
    { key: "checking", institution: "Harbor Credit Union", name: "Everyday Checking", mask: "1111", type: "depository", subtype: "checking", hausType: "checking", balance: 6420.18, owner: single ? "a" : "joint" },
    { key: "savings", institution: "Harbor Credit Union", name: "High Yield Savings", mask: "2222", type: "depository", subtype: "savings", hausType: "savings", balance: 28150.0, owner: single ? "a" : "joint", rate: 4.1 },
  ]);
  const cardA = await linkedAccounts("a", [
    { key: "card-a", institution: "Summit Card Services", name: "Rewards Visa", mask: "3333", type: "credit", subtype: "credit card", hausType: "credit_card", balance: 1843.27, limit: 12000 },
  ]);
  const brokerage = await linkedAccounts("a", [
    { key: "brokerage", institution: "Northline Investing", name: "Individual Brokerage", mask: "4444", type: "investment", subtype: "brokerage", hausType: "brokerage", balance: 0 },
    { key: "roth", institution: "Northline Investing", name: "Roth IRA", mask: "5555", type: "investment", subtype: "roth", hausType: "roth", balance: 0, retirementKind: "roth" },
  ]);
  const loans = await linkedAccounts("a", [
    { key: "mortgage", institution: "Keystone Home Lending", name: "30 Year Fixed Mortgage", mask: "6666", type: "loan", subtype: "mortgage", hausType: "mortgage", balance: 312480.55, rate: 6.25, owner: single ? "a" : "joint" },
    { key: "auto", institution: "Keystone Home Lending", name: "Auto Loan", mask: "7777", type: "loan", subtype: "auto", hausType: "installment", balance: 14210.4, rate: 5.4 },
  ]);
  let cardB = null;
  let k401 = null;
  if (!single) {
    cardB = await linkedAccounts("b", [
      { key: "card-b", institution: "Meridian Bank", name: "Cash Back Mastercard", mask: "8888", type: "credit", subtype: "credit card", hausType: "credit_card", balance: 962.4, limit: 8000 },
    ]);
    k401 = await linkedAccounts("b", [
      { key: "401k", institution: "Crestview Retirement", name: "Employer 401(k)", mask: "9999", type: "investment", subtype: "401k", hausType: "401k", balance: 0, retirementKind: "401k" },
    ]);
  }

  await holding(brokerage.brokerage, "VTI", "Vanguard Total Stock Market ETF", "etf", 84.5, 298.42, 0.84, 241.1);
  await holding(brokerage.brokerage, "AAPL", "Apple Inc.", "equity", 30, 231.55, -1.22, 150.2);
  await holding(brokerage.brokerage, "MSFT", "Microsoft Corporation", "equity", 18, 512.3, 2.05, 330.0);
  await holding(brokerage.brokerage, "NVDA", "NVIDIA Corporation", "equity", 45, 176.9, 3.41, 60.0);
  await holding(brokerage.brokerage, "KO", "Coca-Cola Company", "equity", 60, 68.2, -0.35, 58.9);
  await holding(brokerage.brokerage, "XOM", "Exxon Mobil Corporation", "equity", 25, 112.75, -2.6, 101.4);
  await holding(brokerage.roth, "VXUS", "Vanguard Total International Stock ETF", "etf", 140, 71.8, 0.52, 58.3);
  await holding(brokerage.roth, "BND", "Vanguard Total Bond Market ETF", "etf", 95, 74.1, 0.08, 76.9);
  if (k401) {
    await holding(k401["401k"], "FXAIX", "Fidelity 500 Index Fund", "mutual fund", 310.2, 221.6, 0.79, 160.4);
  }

  // Stock pay and retirement deposits, so the cash-flow window can list each date.
  const planStock = await prisma.security.create({
    data: { plaidSecurityId: "demo-sec-plan", symbol: "NLH", name: "Northline Holdings", type: "equity", closePrice: 42, closePriceAsOf: today },
  });
  const stockEvents = [
    [brokerage.brokerage, 4, "RSU vest", "transfer", 4200, 10],
    [brokerage.brokerage, 18, "RSU vest", "transfer", 4100, 10],
    [brokerage.brokerage, 40, "RSU vest", "transfer", 4300, 10],
    [brokerage.brokerage, 6, "ESPP purchase", "buy", 480, 12],
    [brokerage.brokerage, 22, "ESPP purchase", "buy", 510, 12],
  ];
  for (const [account, day, name, type, amount, quantity] of stockEvents) {
    await investmentTxn(account, planStock.id, day, name, type, amount, quantity);
  }
  // Payroll money arrives as a negative amount, the same way the investment feed records cash in.
  await investmentTxn(brokerage.roth, null, 3, "Payroll deferral", "cash", -250, null);
  await investmentTxn(brokerage.roth, null, 17, "Payroll deferral", "cash", -250, null);
  if (k401) {
    await investmentTxn(k401["401k"], null, 2, "Employee contribution", "cash", -850, null);
    await investmentTxn(k401["401k"], null, 16, "Employee contribution", "cash", -850, null);
    await investmentTxn(k401["401k"], null, 33, "Employee contribution", "cash", -850, null);
  }

  const checking = bank.checking.id;
  const savings = bank.savings.id;
  const card = cardA["card-a"].id;
  const card2 = cardB ? cardB["card-b"].id : card;

  const spendMerchants = [
    ["FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", ["Corner Taqueria", "Blue Door Cafe", "Noodle Bar", "Pizza Palace"], [14, 68]],
    ["GROCERIES", "FOOD_AND_DRINK_GROCERIES", ["Fresh Fields Market", "Valley Grocers"], [45, 190]],
    ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", ["Online Superstore", "The Extraordinarily Long Neighborhood Hardware & Garden Supply Cooperative"], [18, 240]],
    ["TRANSPORTATION", "TRANSPORTATION_GAS", ["Speedway Fuel", "City Transit"], [22, 70]],
    ["ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES", ["Streamflix", "Cineplex 12"], [11, 45]],
    ["PERSONAL_CARE", "PERSONAL_CARE_HAIR_AND_BEAUTY", ["Studio Cuts"], [35, 80]],
    ["MEDICAL", "MEDICAL_PHARMACIES_AND_SUPPLEMENTS", ["Wellness Pharmacy"], [12, 95]],
    ["TRAVEL", "TRAVEL_FLIGHTS", ["Skyway Airlines"], [180, 520]],
  ];

  const rows = [];
  for (let day = 0; day < 150; day++) {
    const perDay = rand() < 0.3 ? 0 : 1 + Math.floor(rand() * 3);
    for (let i = 0; i < perDay; i++) {
      const [primary, detailed, names, [lo, hi]] = pick(spendMerchants);
      if (primary === "TRAVEL" && rand() < 0.8) continue;
      const account = rand() < 0.55 ? card : card2;
      rows.push(txn(account, day, pick(names), lo + rand() * (hi - lo), primary, detailed, { pending: day < 2 && rand() < 0.4 }));
    }
  }
  for (let month = 0; month < 5; month++) {
    const base = month * 30;
    rows.push(txn(checking, base + 1, "Keystone Home Lending Mortgage", 2240.0, "LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT"));
    rows.push(txn(checking, base + 3, "City Power & Water", 180 + rand() * 60, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY"));
    rows.push(txn(checking, base + 5, "Fiberline Internet", 70.0, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_INTERNET_AND_CABLE"));
    rows.push(txn(checking, base + 8, "Keystone Auto Loan", 412.5, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT"));
    for (const off of [base + 2, base + 16]) {
      rows.push(txn(checking, off, "Acme Corp Payroll", -3850.0, "INCOME", "INCOME_WAGES"));
      if (!single) rows.push(txn(checking, off, "Birch Health Payroll", -2975.5, "INCOME", "INCOME_WAGES"));
    }
    rows.push(txn(savings, base + 28, "Interest Paid", -92.4, "INCOME", "INCOME_INTEREST_EARNED"));
    // Transfer the app should pair: out of checking, into savings the next day.
    rows.push(txn(checking, base + 10, "Online Transfer to Savings", 1000.0, "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"));
    rows.push(txn(savings, base + 9, "Online Transfer from Checking", -1000.0, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"));
    // Card payment the app should pair with the card's credit.
    rows.push(txn(checking, base + 12, "Summit Card Payment", 1650.0, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"));
    rows.push(txn(card, base + 11, "Payment Thank You", -1650.0, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"));
  }
  rows.push(txn(card, 6, "Online Superstore", -64.99, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", { memo: "Returned the lamp" }));
  rows.push(txn(card, 20, "Blue Door Cafe", 42.1, "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", { memo: "Birthday lunch" }));
  rows.push(txn(checking, 14, "Monthly Service Fee", 12.0, "BANK_FEES", "BANK_FEES_OTHER_BANK_FEES"));
  await prisma.txn.createMany({ data: rows });

  const posted = await prisma.txn.findMany({ where: { pending: false, date: { lte: daysAgo(3) } }, include: { account: { include: { item: true } } } });
  await prisma.savedTxn.createMany({
    data: posted.map((t) => ({
      plaidTransactionId: t.plaidTransactionId,
      accountId: t.accountId,
      date: t.date,
      name: t.name,
      merchant: t.merchantName ?? t.name,
      rawMerchant: t.name,
      accountName: t.account.name,
      accountMask: t.account.mask,
      institutionName: t.account.item.institutionName,
      owner: t.account.owner,
      category: t.categoryPrimary,
      categoryDetailed: t.categoryDetailed,
      amount: t.amount,
      memo: t.memo,
    })),
  });

  await prisma.categoryBudget.createMany({
    data: [
      { category: "Dining", monthly: 450 },
      { category: "Groceries", monthly: 700 },
      { category: "Shopping", monthly: 350 },
      { category: "Transportation", monthly: 220 },
      { category: "Entertainment", monthly: 80 },
    ],
  });

  const home = await prisma.property.create({
    data: {
      label: "Maple Street Home",
      estimate: 545000,
      asOfDate: daysAgo(20),
      owner: single ? "a" : "joint",
      mortgageAccountId: loans.mortgage.id,
      mortgageBalance: 312480.55,
      rate: 6.25,
      termMonths: 334,
      originalTermMonths: 360,
      originationDate: new Date("2024-06-01"),
      taxAnnual: 6200,
      insuranceAnnual: 1850,
    },
  });
  const car = await prisma.vehicle.create({
    data: { label: "Family SUV", year: 2022, make: "Subaru", model: "Outback", estimate: 24500, asOfDate: daysAgo(20), owner: "a", loanAccountId: loans.auto.id, loanBalance: 14210.4 },
  });
  await prisma.insurancePolicy.create({
    data: {
      type: "home",
      carrier: "Evergreen Mutual",
      owner: single ? "a" : "joint",
      premium: 1850,
      billingFrequency: "annual",
      renewalDate: daysAgo(-45),
      propertyId: home.id,
      coverageJson: JSON.stringify({ deductible: 2500, amount: 420000 }),
    },
  });
  await prisma.insurancePolicy.create({
    data: {
      type: "health",
      carrier: "Lakeside Health Plan",
      owner: single ? "a" : "joint",
      coveredMembers: JSON.stringify(single ? ["a"] : ["a", "b"]),
      premium: 640,
      billingFrequency: "monthly",
      renewalDate: daysAgo(-95),
      coverageJson: JSON.stringify({ deductible: 3000, amount: 9000 }),
    },
  });
  await prisma.insurancePolicy.create({
    data: { type: "auto", carrier: "Evergreen Mutual", owner: "a", premium: 96, billingFrequency: "monthly", renewalDate: daysAgo(-120), vehicleId: car.id },
  });

  await prisma.manualAccount.create({
    data: { hausType: "hsa", name: "Health Savings Account", owner: "a", balance: 8420, asOfDate: daysAgo(10) },
  });
  await prisma.manualHolding.create({
    data: { kind: "crypto", symbol: "BTC", coingeckoId: "bitcoin", name: "Bitcoin", quantity: 0.42, costBasis: 18000, owner: "a", accountName: "Cold storage", editedAt: daysAgo(5) },
  });
  await prisma.manualHolding.create({
    data: { kind: "crypto", symbol: "ETH", coingeckoId: "ethereum", name: "Ethereum", quantity: 3.1, costBasis: 6200, owner: single ? "a" : "b", accountName: "Exchange wallet", editedAt: daysAgo(12) },
  });
  // Daily closes for the manual coins, so the Crypto summary card's 30-day line has something to draw.
  await priceHistory("BTC", 82958, -0.6);
  await priceHistory("ETH", 2656.84, 0.2);
  await prisma.manualHolding.create({
    data: { kind: "security", assetClass: "equity", symbol: "PRIV", name: "Private Company Shares", quantity: 1, costBasis: 5000, quotePrice: 7500, owner: "a", accountName: "Employee equity", editedAt: daysAgo(30) },
  });

  const totals = await netWorthNow();
  const snaps = [];
  for (let i = 365; i >= 0; i--) {
    const drift = 1 - i * 0.0006 + (rand() - 0.5) * 0.01;
    for (const ownerKey of single ? ["all", "a"] : ["all", "a", "b"]) {
      const share = ownerKey === "all" ? 1 : ownerKey === "a" ? 0.6 : 0.4;
      const cash = totals.cash * share * drift;
      const investments = totals.investments * share * drift;
      const realEstate = 545000 * share;
      const vehicles = 24500 * share;
      const liabilities = totals.liabilities * share;
      const d = daysAgo(i);
      d.setHours(0, 0, 0, 0);
      snaps.push({ date: d, ownerKey, cash, investments, realEstate, vehicles, otherAssets: 0, liabilities, netWorth: cash + investments + realEstate + vehicles - liabilities });
    }
  }
  await prisma.netWorthSnapshot.createMany({ data: snaps });
}

async function netWorthNow() {
  const accounts = await prisma.account.findMany();
  const holdings = await prisma.holding.findMany();
  const cash = accounts.filter((a) => a.hausType === "checking" || a.hausType === "savings").reduce((s, a) => s + (a.currentBalance ?? 0), 0);
  const liabilities = accounts
    .filter((a) => ["credit_card", "mortgage", "installment"].includes(a.hausType))
    .reduce((s, a) => s + (a.currentBalance ?? 0), 0);
  const investments = holdings.reduce((s, h) => s + (h.institutionValue ?? 0), 0);
  for (const a of accounts.filter((x) => ["brokerage", "roth", "401k"].includes(x.hausType))) {
    const value = holdings.filter((h) => h.accountId === a.id).reduce((s, h) => s + (h.institutionValue ?? 0), 0);
    await prisma.account.update({ where: { id: a.id }, data: { currentBalance: round2(value), availableBalance: round2(value), previousBalance: round2(value * 0.992) } });
  }
  return { cash, liabilities, investments };
}

const chance = (p) => rand() < p;
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// Money values that tend to break layouts and math: zero, fractions of a cent, very large, negative.
function extremeAmount(typical) {
  const roll = rand();
  if (roll < 0.08) return 0;
  if (roll < 0.14) return 0.01;
  if (roll < 0.2) return typical * 10000;
  if (roll < 0.24) return -typical;
  return typical * (0.2 + rand() * 2);
}

function oddName(base) {
  return pick([
    base,
    base,
    `${base} ${base} ${base} International Holdings & Subsidiaries Group`,
    `Café Ñandú & Søn ${base}`,
    `${base} 🏠`,
    `${base.toUpperCase()}#12345*POS PURCHASE`,
    " ",
  ]);
}

async function seedRandom() {
  const single = chance(0.3);
  await prisma.household.create({
    data: {
      id: "haus",
      nameA: oddName("Morgan"),
      nameB: single ? "Two" : oddName("Jordan"),
      birthdateA: chance(0.8) ? new Date(int(1940, 2005), int(0, 11), int(1, 28)) : null,
      birthdateB: single || chance(0.3) ? null : new Date(int(1940, 2005), int(0, 11), int(1, 28)),
      showCrypto: chance(0.6),
      showRetirement: chance(0.8),
      showProperty: chance(0.8),
      showInsurance: chance(0.5),
      showInsights: chance(0.8),
      pairCardPayments: chance(0.7),
      keepTransactions: chance(0.5),
      transactionsStoredSince: chance(0.5) ? daysAgo(int(0, 400)) : null,
      budgetsSeeded: chance(0.5),
    },
  });
  const owners = single ? ["a", "joint"] : ["a", "b", "joint"];

  const kinds = [
    ["checking", "depository", "checking", 5000],
    ["savings", "depository", "savings", 20000],
    ["credit_card", "credit", "credit card", 2000],
    ["brokerage", "investment", "brokerage", 0],
    ["roth", "investment", "roth", 0],
    ["401k", "investment", "401k", 0],
    ["mortgage", "loan", "mortgage", 300000],
    ["installment", "loan", "auto", 15000],
  ];
  const accounts = [];
  for (const [hausType, type, subtype, typical] of kinds) {
    const count = chance(0.25) ? 0 : int(1, chance(0.2) ? 6 : 2);
    for (let i = 0; i < count; i++) {
      const owner = pick(owners);
      const made = await linkedAccounts(owner, [
        {
          key: `${hausType}-${i}-${int(0, 1e6)}`,
          institution: oddName(pick(["Harbor", "Summit", "Northline", "Keystone"])),
          name: oddName(`${subtype} ${i + 1}`),
          mask: chance(0.2) ? null : String(int(1000, 9999)),
          type,
          subtype,
          hausType,
          balance: typical ? round2(extremeAmount(typical)) : 0,
          limit: hausType === "credit_card" ? pick([0, 500, 10000, null]) : null,
          retirementKind: hausType === "roth" || hausType === "401k" ? hausType : null,
          rate: chance(0.5) ? rand() * 12 : null,
        },
      ]);
      accounts.push(Object.values(made)[0]);
    }
  }

  const symbols = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH"];
  for (const account of accounts.filter((a) => ["brokerage", "roth", "401k"].includes(a.hausType))) {
    const n = chance(0.2) ? 0 : int(1, 8);
    for (let i = 0; i < n; i++) {
      const symbol = `${pick(symbols)}${i}${int(1, 9)}`;
      const price = pick([0, 0.0001, 1.5, 250, 98000, round2(10 + rand() * 500)]);
      const dayPct = pick([0, -99.9, 250000, round2((rand() - 0.5) * 10)]);
      await holding(account, symbol, oddName(`${symbol} Fund`), pick(["equity", "etf", "mutual fund", "cryptocurrency", null]), pick([0, 0.00001, 1, 1e6, int(1, 500)]), price, dayPct, price * (0.5 + rand()));
    }
  }

  const categories = [
    ["FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", 40],
    ["GROCERIES", "FOOD_AND_DRINK_GROCERIES", 120],
    ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", 80],
    ["TRAVEL", "TRAVEL_FLIGHTS", 400],
    ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT", 2000],
    ["LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", 1500],
    ["TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 1000],
    ["INCOME", "INCOME_WAGES", -4000],
    ["SOMETHING_NEW", null, 30],
    [null, null, 25],
  ];
  const cash = accounts.filter((a) => ["checking", "savings", "credit_card"].includes(a.hausType));
  const rows = [];
  if (cash.length) {
    const total = pick([0, 3, 60, 800, 3000]);
    const span = pick([1, 30, 95, 400]);
    for (let i = 0; i < total; i++) {
      const [primary, detailed, typical] = pick(categories);
      const account = pick(cash);
      const amount = round2(extremeAmount(Math.abs(typical)) * Math.sign(typical || 1));
      rows.push(txn(account.id, int(-2, span), oddName(pick(["Corner Shop", "Payroll", "Transfer", "Airline", "Landlord"])), amount, primary, detailed, { pending: chance(0.1), memo: chance(0.05) ? "x".repeat(int(1, 400)) : null }));
    }
    if (cash.length >= 2 && chance(0.7)) {
      for (let i = 0; i < int(1, 10); i++) {
        const [from, to] = [pick(cash), pick(cash)];
        const amount = round2(50 + rand() * 3000);
        const day = int(0, span);
        rows.push(txn(from.id, day, "Transfer out", amount, "TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER"));
        rows.push(txn(to.id, day + int(-2, 2), "Transfer in", -amount, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"));
      }
    }
  }
  for (let i = 0; i < rows.length; i += 500) await prisma.txn.createMany({ data: rows.slice(i, i + 500) });

  if (chance(0.6)) {
    const labels = ["Dining", "Groceries", "Shopping", "Travel", "Made Up Category"];
    for (const category of labels.filter(() => chance(0.6))) {
      await prisma.categoryBudget.create({ data: { category, monthly: pick([0, 1, 250, 1e7]) } });
    }
  }
  const mortgage = accounts.find((a) => a.hausType === "mortgage");
  for (let i = 0; i < pick([0, 0, 1, 3]); i++) {
    await prisma.property.create({
      data: {
        label: oddName(`Home ${i + 1}`),
        estimate: pick([0, 1, 450000, 25000000]),
        asOfDate: daysAgo(int(0, 900)),
        owner: pick(owners),
        mortgageAccountId: i === 0 && mortgage ? mortgage.id : null,
        mortgageBalance: i === 0 && mortgage ? mortgage.currentBalance : null,
        rate: chance(0.5) ? rand() * 9 : null,
        termMonths: chance(0.5) ? int(1, 360) : null,
        originalTermMonths: chance(0.5) ? 360 : null,
        originationDate: chance(0.5) ? daysAgo(int(0, 9000)) : null,
      },
    });
  }
  for (let i = 0; i < pick([0, 1, 2]); i++) {
    await prisma.vehicle.create({ data: { label: oddName(`Car ${i + 1}`), estimate: pick([0, 3000, 250000]), asOfDate: daysAgo(int(0, 900)), owner: pick(owners) } });
  }
  for (let i = 0; i < pick([0, 1, 4]); i++) {
    await prisma.insurancePolicy.create({
      data: { type: pick(["home", "auto", "life", "umbrella", "other"]), carrier: oddName("Carrier"), owner: pick(owners), premium: pick([null, 0, 120, 99999]), billingFrequency: pick(["monthly", "annual", null]), renewalDate: chance(0.7) ? daysAgo(int(-400, 400)) : null },
    });
  }
  for (let i = 0; i < pick([0, 1, 5]); i++) {
    await prisma.manualHolding.create({
      data: { kind: "crypto", symbol: pick(["BTC", "ETH", "SOL", "ZZZNOTACOIN"]), coingeckoId: null, name: oddName("Coin"), quantity: pick([0, 1e-8, 0.5, 1e9]), costBasis: pick([null, 0, 1000]), quotePrice: pick([null, 0, 0.000001, 65000]), owner: pick(owners), accountName: oddName("Wallet"), editedAt: chance(0.5) ? daysAgo(int(0, 900)) : null },
    });
  }
  console.log(`Random household: ${accounts.length} accounts, ${rows.length} transactions.`);
}

try {
  if (profile === "empty") {
    await prisma.household.create({ data: { id: "haus", nameA: "New User" } });
  } else if (profile === "random") {
    await seedRandom();
    await netWorthNow();
  } else {
    await seedFull({ single: profile === "single" });
  }
  console.log(`Seeded the ${profile} test household in prisma/demo-${profile}.db${profile === "random" ? ` from seed ${randomSeed}` : ""}`);
} finally {
  await prisma.$disconnect();
}
