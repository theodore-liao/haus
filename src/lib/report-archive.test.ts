import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plaidIdsOnLedger, savedChargeCounted, savedOwnerNow } from "./report-archive";

describe("saved charge archive", () => {
  it("does not count a snapshot while the charge is still posted under another owner", () => {
    const ledger = [{ plaidTransactionId: "p1", owner: "a" }];
    const snapshot = { plaidTransactionId: "p1", owner: "joint" };
    const ids = plaidIdsOnLedger(ledger);

    assert.equal(savedChargeCounted(snapshot, ids, "b"), false);
    assert.equal(savedChargeCounted(snapshot, ids, "all"), false);
  });

  it("still counts a snapshot after Plaid removes the charge", () => {
    const ledger = [{ plaidTransactionId: "other", owner: "a" }];
    const snapshot = { plaidTransactionId: "gone", owner: "b" };
    assert.equal(savedChargeCounted(snapshot, plaidIdsOnLedger(ledger), "b"), true);
    assert.equal(savedChargeCounted(snapshot, plaidIdsOnLedger(ledger), "a"), false);
  });

  it("uses the linked account's current owner when the snapshot is stale", () => {
    const owner = savedOwnerNow({ owner: "joint", accountId: "acc" }, new Map([["acc", "a"]]));
    const snapshot = { plaidTransactionId: "gone", owner };
    assert.equal(savedChargeCounted(snapshot, plaidIdsOnLedger([]), "b"), false);
    assert.equal(savedChargeCounted(snapshot, plaidIdsOnLedger([]), "a"), true);
    assert.equal(savedOwnerNow({ owner: "joint", accountId: "deleted" }, new Map()), "joint");
  });

  it("a filter-scoped ledger set would resurrect the stale snapshot", () => {
    const ledger = [{ plaidTransactionId: "p1", owner: "a" }];
    const visibleToB = ledger.filter((row) => row.owner === "b" || row.owner === "joint");
    const snapshot = { plaidTransactionId: "p1", owner: "joint" };

    assert.equal(savedChargeCounted(snapshot, plaidIdsOnLedger(visibleToB), "b"), true);
    assert.equal(savedChargeCounted(snapshot, plaidIdsOnLedger(ledger), "b"), false);
  });
});
