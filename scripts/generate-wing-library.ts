/**
 * Regenerates src/lib/solver/wingLibrary.json (run: npm run gen:wings).
 * The output is deterministic; tests re-verify every entry.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_CYCLE_COUNT, generateWingLibrary, serializeLibrary } from "../src/lib/solver/wingLibraryGen";

const lib = generateWingLibrary({ setupDepth: 3, log: (s) => console.log(s) });
if (lib.size !== ALL_CYCLE_COUNT) throw new Error(`incomplete library: ${lib.size}`);
const out = resolve(import.meta.dirname, "../src/lib/solver/wingLibrary.json");
writeFileSync(out, JSON.stringify(serializeLibrary(lib)) + "\n");
console.log(`wrote ${out}`);
