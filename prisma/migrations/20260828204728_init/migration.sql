-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'haus',
    "nameA" TEXT NOT NULL DEFAULT 'One',
    "nameB" TEXT NOT NULL DEFAULT 'Two',
    "quoteApiKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlaidItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "institutionId" TEXT,
    "institutionName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'good',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "products" TEXT NOT NULL DEFAULT '[]',
    "defaultOwner" TEXT NOT NULL DEFAULT 'joint',
    "transactionsCursor" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidAccountId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "officialName" TEXT,
    "mask" TEXT,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "hausType" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT 'joint',
    "isRetirement" BOOLEAN NOT NULL DEFAULT false,
    "retirementKind" TEXT,
    "currentBalance" REAL,
    "availableBalance" REAL,
    "limitAmount" REAL,
    "isoCurrency" TEXT NOT NULL DEFAULT 'USD',
    "previousBalance" REAL,
    "interestRate" REAL,
    "liabilityJson" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PlaidItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Txn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidTransactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "authorizedDate" DATETIME,
    "name" TEXT NOT NULL,
    "merchantName" TEXT,
    "amount" REAL NOT NULL,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "categoryPrimary" TEXT,
    "categoryDetailed" TEXT,
    "userCategory" TEXT,
    "userMerchant" TEXT,
    "isoCurrency" TEXT NOT NULL DEFAULT 'USD',
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "isCcPayment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Txn_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MerchantRule" (
    "merchantKey" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT,
    "displayName" TEXT
);

-- CreateTable
CREATE TABLE "Security" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidSecurityId" TEXT NOT NULL,
    "symbol" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "closePrice" REAL,
    "closePriceAsOf" DATETIME
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceKey" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "securityId" TEXT,
    "symbol" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "quantity" REAL NOT NULL,
    "costBasis" REAL,
    "institutionValue" REAL,
    "institutionPrice" REAL,
    "quotePrice" REAL,
    "quoteChange" REAL,
    "quoteChangePct" REAL,
    "quoteAsOf" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Holding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Holding_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentTxn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidInvestmentTxnId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "securityId" TEXT,
    "date" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "quantity" REAL,
    "amount" REAL NOT NULL,
    "price" REAL,
    "fees" REAL,
    "isoCurrency" TEXT NOT NULL DEFAULT 'USD',
    CONSTRAINT "InvestmentTxn_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentTxn_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BalanceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "current" REAL NOT NULL,
    "available" REAL,
    CONSTRAINT "BalanceSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NetWorthSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "ownerKey" TEXT NOT NULL DEFAULT 'all',
    "cash" REAL NOT NULL,
    "investments" REAL NOT NULL,
    "realEstate" REAL NOT NULL,
    "vehicles" REAL NOT NULL,
    "otherAssets" REAL NOT NULL,
    "liabilities" REAL NOT NULL,
    "netWorth" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "address" TEXT,
    "estimate" REAL NOT NULL,
    "asOfDate" DATETIME NOT NULL,
    "owner" TEXT NOT NULL DEFAULT 'joint',
    "mortgageAccountId" TEXT,
    "rate" REAL,
    "termMonths" INTEGER,
    "piti" REAL,
    "rent" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "estimate" REAL NOT NULL,
    "asOfDate" DATETIME NOT NULL,
    "owner" TEXT NOT NULL DEFAULT 'joint',
    "loanAccountId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "policyNumber" TEXT,
    "namedInsured" TEXT NOT NULL DEFAULT 'joint',
    "owner" TEXT NOT NULL DEFAULT 'joint',
    "coverageJson" TEXT NOT NULL DEFAULT '{}',
    "premium" REAL,
    "billingFrequency" TEXT,
    "effectiveDate" DATETIME,
    "renewalDate" DATETIME,
    "propertyId" TEXT,
    "vehicleId" TEXT,
    "hsaEligible" BOOLEAN NOT NULL DEFAULT false,
    "coveredMembers" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InsuranceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ocrText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsuranceDocument_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManualAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hausType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "beneficiary" TEXT,
    "balance" REAL NOT NULL,
    "asOfDate" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaidItem_itemId_key" ON "PlaidItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_plaidAccountId_key" ON "Account"("plaidAccountId");

-- CreateIndex
CREATE INDEX "Account_owner_idx" ON "Account"("owner");

-- CreateIndex
CREATE INDEX "Account_hausType_idx" ON "Account"("hausType");

-- CreateIndex
CREATE UNIQUE INDEX "Txn_plaidTransactionId_key" ON "Txn"("plaidTransactionId");

-- CreateIndex
CREATE INDEX "Txn_date_idx" ON "Txn"("date");

-- CreateIndex
CREATE INDEX "Txn_accountId_idx" ON "Txn"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Security_plaidSecurityId_key" ON "Security"("plaidSecurityId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_sourceKey_key" ON "Holding"("sourceKey");

-- CreateIndex
CREATE INDEX "Holding_accountId_idx" ON "Holding"("accountId");

-- CreateIndex
CREATE INDEX "Holding_symbol_idx" ON "Holding"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentTxn_plaidInvestmentTxnId_key" ON "InvestmentTxn"("plaidInvestmentTxnId");

-- CreateIndex
CREATE INDEX "InvestmentTxn_date_idx" ON "InvestmentTxn"("date");

-- CreateIndex
CREATE INDEX "InvestmentTxn_accountId_idx" ON "InvestmentTxn"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceSnapshot_accountId_date_key" ON "BalanceSnapshot"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "NetWorthSnapshot_date_ownerKey_key" ON "NetWorthSnapshot"("date", "ownerKey");
