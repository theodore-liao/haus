import { cookies } from "next/headers";
import { monthDefault, PREF_MONTH_WINDOW } from "./prefs";
import { monthChip } from "./range";

async function preferredMonth() {
  const jar = await cookies();
  return monthDefault(jar.get(PREF_MONTH_WINDOW)?.value);
}

/** Current or previous, from the Settings cookie. */
export async function preferredMonthDefault() {
  return preferredMonth();
}

/** The month date chips should open on, from the Settings cookie. */
export async function preferredMonthChip() {
  return monthChip(await preferredMonth());
}
