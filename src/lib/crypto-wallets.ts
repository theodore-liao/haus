import { prisma } from "./db";
import { CHAIN_META, dropFakeStables, scanAddress, shortAddress, type OnchainAsset } from "./onchain";
import { enrichCryptoQuotes } from "./quotes";
import { snapshotNetWorth } from "./plaid-sync";
import { significantOnly } from "./token-prices";
import { assetIdsToDrop } from "./wallet-assets";

export async function syncWalletById(id: string, opts?: { snapshot?: boolean }) {
  const wallet = await prisma.cryptoWallet.findUnique({ where: { id }, include: { assets: true } });
  if (!wallet) throw new Error("Wallet not found.");
  try {
    // Tokens already on file can be re-read from a chain's RPC when its explorer refuses to answer.
    const scanned = await scanAddress(wallet.address, wallet.assets.filter((a) => !a.tokenKey.startsWith("defi:")));
    await persistAssets(wallet.id, scanned.assets, scanned.confirmedChains, scanned.keepTokens);
    const updated = await prisma.cryptoWallet.update({
      where: { id: wallet.id },
      data: {
        address: scanned.address,
        addressType: scanned.type,
        lastSyncedAt: new Date(),
        lastError: walletError(scanned, wallet.assets),
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
      lastError: walletError(scanned),
    },
  });
  await persistAssets(wallet.id, scanned.assets, scanned.confirmedChains, scanned.keepTokens);
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

function walletError(
  scanned: { assets: { chain: string }[]; confirmedChains: string[] },
  stored: { chain: string }[] = [],
) {
  // Chains that hold balances on file but didn't answer this time: their balances stay, and the message says so.
  const unreached = [...new Set(stored.map((a) => a.chain))].filter(
    (c) => !scanned.confirmedChains.includes(c) && !scanned.assets.some((a) => a.chain === c),
  );
  if (unreached.length) {
    return `Couldn't reach ${unreached.map((c) => CHAIN_META[c]?.label ?? c).join(", ")}. Showing the last balances found.`;
  }
  if (scanned.assets.length) return null;
  if (scanned.confirmedChains.length === 0) return "Could not refresh this wallet.";
  return "No balances found on supported chains.";
}

async function persistAssets(
  walletId: string,
  assets: OnchainAsset[],
  confirmedChains: string[],
  keepTokens: string[],
) {
  assets = significantOnly(dropFakeStables(assets));
  const existing = await prisma.cryptoWalletAsset.findMany({ where: { walletId } });
  const drop = new Set(assetIdsToDrop(existing, assets, confirmedChains, keepTokens));
  for (const row of existing) {
    if (drop.has(row.id)) {
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
