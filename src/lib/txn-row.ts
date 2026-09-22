export type TxnRow = {
  id: string;
  date: string;
  name: string;
  merchant: string;
  rawMerchant: string | null;
  account: string;
  accountMask: string | null;
  institution: string | null;
  owner: string;
  ownerLabel: string;
  category: string | null;
  categoryDetailed: string | null;
  amount: number;
  pending: boolean;
  isTransfer: boolean;
  isCcPayment: boolean;
  /** True when the row is excluded from spending. */
  internal: boolean;
  /** Set when this row was paired with the same amount on another linked account. */
  cardMatch: "matched" | null;
  memo: string | null;
};
