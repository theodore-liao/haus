import { createHash } from "crypto";
import { HDKey } from "@scure/bip32";
import { p2pkh, p2wpkh, p2sh, p2tr } from "@scure/btc-signer";

const GAP = 40;

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SLIP132 = {
  xpub: [0x04, 0x88, 0xb2, 0x1e],
  ypub: [0x04, 0x9d, 0x7c, 0xb2],
  zpub: [0x04, 0xb2, 0x47, 0x46],
} as const;

export function hdAddresses(extended: string): string[] {
  const hd = HDKey.fromExtendedKey(toXpubKey(extended));
  const out = new Set<string>();
  for (const change of [0, 1]) {
    for (let i = 0; i < GAP; i++) {
      const node = hd.deriveChild(change).deriveChild(i);
      const pub = node.publicKey;
      if (!pub) continue;
      for (const a of scriptAddresses(pub)) out.add(a);
    }
  }
  return [...out];
}

function scriptAddresses(pub: Uint8Array): string[] {
  const found: string[] = [];
  try {
    const wpkh = p2wpkh(pub);
    if (wpkh.address) found.push(wpkh.address);
    const sh = p2sh(wpkh);
    if (sh.address) found.push(sh.address);
  } catch {
    /* skip */
  }
  try {
    const pkh = p2pkh(pub);
    if (pkh.address) found.push(pkh.address);
  } catch {
    /* skip */
  }
  try {
    const xonly = pub.length === 33 ? pub.slice(1) : pub;
    const tr = p2tr(xonly);
    if (tr.address) found.push(tr.address);
  } catch {
    /* skip */
  }
  return found;
}

/** Same key material as xpub/ypub/zpub. Blockbook only scans the script type matching the prefix. */
export function slip132Variants(extended: string): string[] {
  const out = new Set<string>([extended]);
  for (const version of Object.values(SLIP132)) {
    const recoded = recodeExtended(extended, version);
    if (recoded) out.add(recoded);
  }
  return [...out];
}

function toXpubKey(extended: string): string {
  if (extended.startsWith("xpub")) return extended;
  return recodeExtended(extended, SLIP132.xpub) ?? extended;
}

function recodeExtended(extended: string, version: readonly number[]): string | null {
  try {
    const bytes = b58decode(extended);
    if (bytes.length < 78) return null;
    bytes[0] = version[0];
    bytes[1] = version[1];
    bytes[2] = version[2];
    bytes[3] = version[3];
    return b58encodeCheck(bytes.slice(0, bytes.length - 4));
  } catch {
    return null;
  }
}

function b58decode(str: string): Uint8Array {
  let num = BigInt(0);
  for (const c of str) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("bad base58");
    num = num * BigInt(58) + BigInt(i);
  }
  const hex = num.toString(16);
  const pad = hex.length % 2 ? `0${hex}` : hex;
  const body = new Uint8Array(pad.length / 2);
  for (let i = 0; i < body.length; i++) body[i] = parseInt(pad.slice(i * 2, i * 2 + 2), 16);
  let zeros = 0;
  for (const c of str) {
    if (c === "1") zeros += 1;
    else break;
  }
  const out = new Uint8Array(zeros + body.length);
  out.set(body, zeros);
  return out;
}

function b58encodeCheck(payload: Uint8Array): string {
  const hash = createHash("sha256").update(createHash("sha256").update(payload).digest()).digest();
  const full = new Uint8Array(payload.length + 4);
  full.set(payload, 0);
  full.set(hash.subarray(0, 4), payload.length);
  let n = BigInt(0);
  for (const b of full) n = n * BigInt(256) + BigInt(b);
  let out = "";
  while (n > 0) {
    const rem = Number(n % BigInt(58));
    n = n / BigInt(58);
    out = B58[rem] + out;
  }
  for (const b of full) {
    if (b === 0) out = `1${out}`;
    else break;
  }
  return out;
}
