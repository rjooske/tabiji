import { trimIfTooLong } from "./bot.js";

describe("string trimming", () => {
  it("short enough; don't trim", () => {
    const tests: [string, number][] = [
      ["aaa", 4],
      ["  hi  ", 10],
      ["三文字", 3],
      ["⚠️👍🏻👍🏿", 3],
    ];
    for (const [s, n] of tests) {
      expect(trimIfTooLong(s, n)).toBe(s);
    }
  });

  it("too long; trim", () => {
    const tests: [string, number, string][] = [
      ["aaa aaa aaa", 4, "aaa…"],
      ["  hi  ", 2, " …"],
      ["三文字以上", 3, "三文…"],
      ["⚠️👍🏻👍🏿", 2, "⚠️…"],
    ];
    for (const [s, n, want] of tests) {
      expect(trimIfTooLong(s, n)).toBe(want);
    }
  });
});
