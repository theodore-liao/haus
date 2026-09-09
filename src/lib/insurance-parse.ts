export type InsuranceDraft = {
  type: string;
  carrier: string;
  policyNumber: string;
  namedInsured: string;
  premium: number | null;
  billingFrequency: string;
  effectiveDate: string;
  renewalDate: string;
  coverage: Record<string, unknown>;
  hsaEligible: boolean;
  coveredMembers: string[];
  notes: string;
};

const CARRIERS = [
  "State Farm",
  "Allstate",
  "GEICO",
  "Progressive",
  "USAA",
  "Liberty Mutual",
  "Farmers",
  "Travelers",
  "Nationwide",
  "American Family",
  "Chubb",
  "Amica",
  "Erie",
  "Hartford",
  "Aetna",
  "Cigna",
  "UnitedHealthcare",
  "United Healthcare",
  "Blue Cross",
  "Blue Shield",
  "Anthem",
  "Kaiser",
  "Humana",
  "Oscar",
  "MetLife",
  "Prudential",
  "Northwestern Mutual",
  "New York Life",
  "MassMutual",
  "Guardian",
  "Pacific Life",
  "Lincoln Financial",
];

function money(re: RegExp, text: string): number | null {
  const m = text.match(re);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function firstDate(text: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(
      `${label}[:\\s]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[A-Za-z]{3,9}\\s+[0-9]{1,2},?\\s+[0-9]{4})`,
      "i",
    );
    const m = text.match(re);
    if (m?.[1]) {
      const d = new Date(m[1]);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return "";
}

function findCarrier(text: string): string {
  const upper = text;
  for (const c of CARRIERS) {
    if (upper.toLowerCase().includes(c.toLowerCase())) return c === "United Healthcare" ? "UnitedHealthcare" : c;
  }
  const m = text.match(/(?:carrier|company|insurer|plan sponsor)[:\s]+([A-Za-z0-9&.,' -]{3,40})/i);
  return m?.[1]?.trim() ?? "";
}

function policyNumber(text: string): string {
  const m = text.match(
    /(?:policy\s*(?:number|#|no\.?)|member\s*id|id\s*number)[:\s#]*([A-Z0-9\-]+)/i,
  );
  return m?.[1] ?? "";
}

function namedInsured(text: string): "a" | "b" | "joint" {
  if (/\b(joint|and\s+spouse|named insureds)\b/i.test(text)) return "joint";
  return "joint";
}

function billingFrequency(text: string): string {
  if (/annual|yearly/i.test(text)) return "annual";
  if (/semi[- ]?annual/i.test(text)) return "semiannual";
  if (/quarter/i.test(text)) return "quarterly";
  if (/month/i.test(text)) return "monthly";
  return "";
}

export function parseInsuranceText(text: string, type: string): InsuranceDraft {
  const coverage: Record<string, unknown> = {};

  if (type === "home") {
    coverage.dwelling = money(/dwelling[:\s$]*([0-9,]+\.?\d*)/i, text);
    coverage.otherStructures = money(/other structures[:\s$]*([0-9,]+\.?\d*)/i, text);
    coverage.personalProperty = money(/personal property[:\s$]*([0-9,]+\.?\d*)/i, text);
    coverage.liability = money(/(?:personal liability|liability)[:\s$]*([0-9,]+\.?\d*)/i, text);
    coverage.medical = money(/medical(?: payments)?[:\s$]*([0-9,]+\.?\d*)/i, text);
    coverage.deductible = money(/deductible[:\s$]*([0-9,]+\.?\d*)/i, text);
  } else if (type === "vehicle") {
    coverage.liabilityLimits =
      text.match(/liability[:\s]*([0-9/$,\s]+)/i)?.[1]?.trim() ?? "";
    coverage.comprehensiveDeductible = money(/comprehensive[:\s$]*([0-9,]+\.?\d*)/i, text);
    coverage.collisionDeductible = money(/collision[:\s$]*([0-9,]+\.?\d*)/i, text);
    coverage.uninsuredMotorist =
      text.match(/uninsured(?: motorist)?[:\s$]*([0-9/$,\s]+)/i)?.[1]?.trim() ?? "";
  } else if (type === "health" || type === "vision" || type === "dental") {
    coverage.planName =
      text.match(/(?:plan name|product)[:\s]+([A-Za-z0-9 &'/-]{3,50})/i)?.[1]?.trim() ?? "";
    coverage.networkType = /ppo/i.test(text)
      ? "PPO"
      : /hmo/i.test(text)
        ? "HMO"
        : /epo/i.test(text)
          ? "EPO"
          : /hdhp|high deductible/i.test(text)
            ? "HDHP"
            : "";
    coverage.deductibleIndividual = money(/individual(?: deductible)?[:\s$]*([0-9,]+\.?\d*)/i, text);
    coverage.deductibleFamily = money(/family(?: deductible)?[:\s$]*([0-9,]+\.?\d*)/i, text);
    coverage.oopMaxIndividual = money(
      /(?:out[- ]of[- ]pocket max(?:imum)?(?: \(individual\))?)[:\s$]*([0-9,]+\.?\d*)/i,
      text,
    );
    coverage.oopMaxFamily = money(
      /(?:out[- ]of[- ]pocket max(?:imum)?(?: \(family\))?)[:\s$]*([0-9,]+\.?\d*)/i,
      text,
    );
    coverage.copay = text.match(/copay(?:ment)?[:\s$]*([0-9$%,. ]+)/i)?.[1]?.trim() ?? "";
    coverage.coinsurance = text.match(/coinsurance[:\s]*([0-9% ]+)/i)?.[1]?.trim() ?? "";
  } else if (type === "life" || type === "umbrella" || type === "other") {
    coverage.faceAmount = money(/(?:face amount|coverage amount|limit)[:\s$]*([0-9,]+\.?\d*)/i, text);
    coverage.lifeType = /term/i.test(text) ? "term" : /whole/i.test(text) ? "whole" : /umbrella/i.test(text) ? "umbrella" : "";
  }

  const members: string[] = [];

  return {
    type,
    carrier: findCarrier(text),
    policyNumber: policyNumber(text),
    namedInsured: namedInsured(text),
    premium: money(/(?:premium|total premium|amount due)[:\s$]*([0-9,]+\.?\d*)/i, text),
    billingFrequency: billingFrequency(text),
    effectiveDate: firstDate(text, ["effective", "effective date", "start date", "from"]),
    renewalDate: firstDate(text, ["renewal", "expiration", "expires", "end date", "through"]),
    coverage,
    hsaEligible: /hsa[- ]eligible|hdhp/i.test(text),
    coveredMembers: members,
    notes: "",
  };
}
