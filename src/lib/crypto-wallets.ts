import { prisma } from "./db";
import { dropFakeStables, scanAddress, shortAddress, type OnchainAsset } from "./onchain";
import { enrichCryptoQuotes } from "./quotes";
import { snapshotNetWorth } from "./plaid-sync";
import { significantOnly } from "./token-prices";

export async function syncWalletById(id: string, opts?: { snapshot?: boolean }) {
  const wallet = await prisma.cryptoWallet.findUnique({ where: { id } });
  if (!wallet) throw new Error("Wallet not found.");
  try {
    const scanned = await scanAddress(wallet.address);
    await persistAssets(wallet.id, scanned.assets);
    const updated = await prisma.cryptoWallet.update({
      where: { id: wallet.id },
      data: {
        address: scanned.address,
        addressType: scanned.type,
        lastSyncedAt: new Date(),
        lastError: scanned.assets.length ? null : "No balances found on supported chains.",
      },
      include: { assets: true },
    });
    if (opts?.snapshot !== false) {
      await enrichCryptoQuotes().catch(() => null);
      await snapshotNetWorth().catch(() => null);
    }
    return prisma.cryptoWallet.findUnique({ where: { id: updated.id }, include: { assets: true } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scan failed.";
    await prisma.cryptoWallet.update({
      where: { id: wallet.id },
      data: { lastError: message, lastSyncedAt: new Date() },
    });
    throw e;
  }
}

export async function addWallet(input: { address: string; label?: string | null; owner: string }) {
  const scanned = await scanAddress(input.address);
  const existing = await prisma.cryptoWallet.findUnique({ where: { address: scanned.address } });
  if (existing) throw new Error("That wallet is already on the ledger.");
  const wallet = await prisma.cryptoWallet.create({
    data: {
      address: scanned.address,
      addressType: scanned.type,
      label: input.label?.trim() || shortAddress(scanned.address),
      owner: input.owner,
      lastSyncedAt: new Date(),
      lastError: scanned.assets.length ? null : "No balances found on supported chains.",
    },
  });
  await persistAssets(wallet.id, scanned.assets);
  await enrichCryptoQuotes().catch(() => null);
  await snapshotNetWorth().catch(() => null);
  return prisma.cryptoWallet.findUnique({ where: { id: wallet.id }, include: { assets: true } });
}

export async function syncAllWallets() {
  const wallets = await prisma.cryptoWallet.findMany({ select: { id: true } });
  for (const w of wallets) {
    await syncWalletById(w.id, { snapshot: false }).catch(() => null);
  }
  await enrichCryptoQuotes().catch(() => null);
  await snapshotNetWorth().catch(() => null);
}

async function persistAssets(walletId: string, assets: OnchainAsset[]) {
  assets = significantOnly(dropFakeStables(assets));
  const keep = new Set(assets.map((a) => `${a.chain}:${a.tokenKey}`));
  const existing = await prisma.cryptoWalletAsset.findMany({ where: { walletId } });
  for (const row of existing) {
    if (!keep.has(`${row.chain}:${row.tokenKey}`)) {
      await prisma.cryptoWalletAsset.delete({ where: { id: row.id } });
    }
  }
  for (const a of assets) {
    await prisma.cryptoWalletAsset.upsert({
      where: { walletId_chain_tokenKey: { walletId, chain: a.chain, tokenKey: a.tokenKey } },
      create: {
        walletId,
        chain: a.chain,
        tokenKey: a.tokenKey,
        symbol: a.symbol,
        name: a.name,
        contractAddress: a.contractAddress,
        decimals: a.decimals,
        quantity: a.quantity,
        coingeckoId: a.coingeckoId,
        quotePrice: a.quotePrice ?? undefined,
      },
      update: {
        symbol: a.symbol,
        name: a.name,
        contractAddress: a.contractAddress,
        decimals: a.decimals,
        quantity: a.quantity,
        coingeckoId: a.coingeckoId ?? undefined,
        quotePrice: a.quotePrice ?? undefined,
      },
    });
  }
}
