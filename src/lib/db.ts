import { PrismaClient } from "@prisma/client";
import { encryptSecret } from "./token-crypto";

const PRISMA_REV = 10;
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaRev?: number };

if (globalForPrisma.prismaRev !== PRISMA_REV) {
  void globalForPrisma.prisma?.$disconnect();
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaRev = PRISMA_REV;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

let sealedTokens = false;

async function sealPlaidTokens() {
  if (sealedTokens) return;
  sealedTokens = true;
  try {
    const items = await prisma.plaidItem.findMany({ select: { id: true, accessToken: true } });
    for (const item of items) {
      const sealed = encryptSecret(item.accessToken);
      if (sealed === item.accessToken) continue;
      await prisma.plaidItem.update({
        where: { id: item.id },
        data: { accessToken: sealed },
      });
    }
  } catch {
    sealedTokens = false;
  }
}

export async function ensureHousehold() {
  await sealPlaidTokens();
  return prisma.household.upsert({
    where: { id: "haus" },
    create: { id: "haus", nameA: "One", nameB: "Two" },
    update: {},
  });
}
