import { BrandMark } from "./brand-mark";
import { Money } from "./money";
import { OwnerTag } from "./type";
import { withoutInstitution } from "@/lib/account-label";
import type { CashAccount } from "@/lib/queries";

/** Where a cash total sits: each account with its bank's logo and holder, largest first, then the total they make. */
export function CashAccounts({ accounts }: { accounts: CashAccount[] }) {
  if (!accounts.length) return <p className="text-sm text-muted-foreground">No checking or savings accounts are linked yet.</p>;
  const total = accounts.reduce((sum, a) => sum + a.balance, 0);
  return (
    <div className="cash-accounts">
      <div className="kicker mb-2">Where the cash is</div>
      <ul className="space-y-1.5">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm" title={a.name}>
            <BrandMark kind="institution" name={a.institution ?? a.name} size={16} />
            <span className="flex min-w-0 flex-1 items-baseline">
              {/* The logo already names the bank. */}
              <span className="truncate">{withoutInstitution(a.name, a.institution)}</span>
              <OwnerTag>{a.holder}</OwnerTag>
            </span>
            <span className="num shrink-0">
              <Money value={a.balance} />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-6 border-t border-border pt-2 text-sm font-medium">
        <span>Cash on hand</span>
        <span className="num">
          <Money value={total} />
        </span>
      </div>
    </div>
  );
}
