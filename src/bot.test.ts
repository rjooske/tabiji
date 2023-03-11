import line from "@line/bot-sdk";
import { decideAction, trimIfTooLong } from "./bot.js";

describe("decide actions", () => {
  it("no actions for non text message events", () => {
    const base: line.EventBase = {
      source: { type: "user", userId: "" },
      mode: "active",
      timestamp: 0,
    };
    const tests: line.WebhookEvent[] = [
      { ...base, type: "unsend", unsend: { messageId: "" } },
      { ...base, type: "follow", replyToken: "" },
      { ...base, type: "unfollow" },
      { ...base, type: "join", replyToken: "" },
      { ...base, type: "leave" },
      {
        ...base,
        type: "memberJoined",
        replyToken: "",
        joined: { members: [] },
      },
      { ...base, type: "memberLeft", left: { members: [] } },
      { ...base, type: "postback", replyToken: "", postback: { data: "" } },
      {
        ...base,
        type: "videoPlayComplete",
        replyToken: "",
        videoPlayComplete: { trackingId: "" },
      },
      {
        ...base,
        type: "beacon",
        replyToken: "",
        beacon: { type: "enter", hwid: "" },
      },
      {
        ...base,
        type: "accountLink",
        replyToken: "",
        link: { result: "ok", nonce: "" },
      },
      {
        ...base,
        type: "things",
        replyToken: "",
        things: { type: "link", deviceId: "" },
      },
    ];
    for (const test of tests) {
      expect(decideAction(test, new Map())).toBeUndefined();
    }
  });

  it("no actions for non single user messages", () => {
    const base: Omit<line.MessageEvent, "source"> = {
      type: "message",
      replyToken: "",
      message: { type: "text", text: "foo", id: "" },
      mode: "active",
      timestamp: 0,
    };
    const tests: line.MessageEvent[] = [
      { ...base, source: { type: "room", roomId: "" } },
      { ...base, source: { type: "group", groupId: "" } },
    ];
    for (const test of tests) {
      expect(decideAction(test, new Map())).toBeUndefined();
    }
  });
});

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
