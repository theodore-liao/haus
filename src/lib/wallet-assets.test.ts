import assert from "node:assert/strict";
import test from "node:test";
import { assetIdsToDrop } from "./wallet-assets";

const btc = { id: "btc", chain: "bitcoin", tokenKey: "native" };
const usdc = { id: "usdc", chain: "ethereum", tokenKey: "0xa0b8" };
const kamino = { id: "kam", chain: "solana", tokenKey: "defi:kamino:lending:1" };

test("a chain that did not answer keeps its balances", () => {
  assert.deepEqual(assetIdsToDrop([btc, usdc], [], []), []);
  assert.deepEqual(assetIdsToDrop([btc, usdc], [], ["ethereum"]), ["usdc"]);
});

test("a confirmed empty chain drops balances that are gone", () => {
  assert.deepEqual(assetIdsToDrop([btc], [], ["bitcoin"]), ["btc"]);
});

test("positions still in the scan are kept", () => {
  assert.deepEqual(
    assetIdsToDrop([btc, usdc], [{ chain: "bitcoin", tokenKey: "native" }], ["bitcoin", "ethereum"]),
    ["usdc"],
  );
});

test("a failed side query does not drop positions it could not see", () => {
  assert.deepEqual(assetIdsToDrop([kamino], [], ["solana"], ["defi:kamino:"]), []);
  assert.deepEqual(assetIdsToDrop([kamino], [], ["solana"], ["defi:jupiter:"]), ["kam"]);
});
