import { trimIfTooLong } from "./bot.js";

describe("string trimming", () => {
  describe("short enough; don't trim", () => {
    const tests: [string, number][] = [
      ["aaa", 4],
      ["  hi  ", 10],
      ["三文字", 3],
      ["⚠️👍🏻👍🏿", 3],
    ];
    for (const [s, n] of tests) {
      it(`${JSON.stringify(s)}, ${n} -> ${JSON.stringify(s)}`, () =>
        expect(trimIfTooLong(s, n)).toBe(s));
    }
  });

  describe("too long; trim", () => {
    const tests: [string, number, string][] = [
      ["aaa aaa aaa", 4, "aaa…"],
      ["  hi  ", 2, " …"],
      ["三文字以上", 4, "三文字…"],
      ["⚠️👍🏻👍🏿", 2, "⚠️…"],
    ];
    for (const [s, n, want] of tests) {
      it(`${JSON.stringify(s)}, ${n} -> ${JSON.stringify(want)}`, () =>
        expect(trimIfTooLong(s, n)).toBe(want));
    }
  });
});
