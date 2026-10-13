import { describe, expect, it } from "vitest";
import { getWingLibrary } from "@/lib/solver/edges";
import { ALL_CYCLE_COUNT, classifyWingCycle, cycleKey, seqDest } from "@/lib/solver/wingLibraryGen";

describe("wing 3-cycle library", () => {
  it("covers every directed 3-cycle with a clean, verified sequence", () => {
    const lib = getWingLibrary();
    expect(lib.size).toBe(ALL_CYCLE_COUNT);
    let maxLen = 0;
    for (const [key, moves] of lib) {
      const r = classifyWingCycle(seqDest(moves));
      expect(r, `entry ${key}`).not.toBeNull();
      expect(cycleKey(...r!.cycle)).toBe(key);
      maxLen = Math.max(maxLen, moves.length);
    }
    expect(maxLen).toBeLessThanOrEqual(16);
  });
});
