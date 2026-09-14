import { probe, printJson } from "./lib.mjs";

const result = await probe();
printJson(result);
process.exit(result.ok ? 0 : 1);
