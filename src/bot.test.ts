import line from "@line/bot-sdk";
import { exportedForTesting, StableDiffusionInJapaneseAction } from "./bot.js";

const { decideAction, trimIfTooLong } = exportedForTesting;

describe("decide actions", () => {
  it("no actions for non message events", () => {
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

  it("no actions for non text message events", () => {
    const base: Omit<line.MessageEvent, "message"> = {
      type: "message",
      replyToken: "",
      source: { type: "user", userId: "" },
      mode: "active",
      timestamp: 0,
    };
    const tests: line.MessageEvent[] = [
      {
        ...base,
        message: { type: "image", id: "", contentProvider: { type: "line" } },
      },
      {
        ...base,
        message: { type: "video", id: "", contentProvider: { type: "line" } },
      },
      {
        ...base,
        message: {
          type: "audio",
          id: "",
          duration: 0,
          contentProvider: { type: "line" },
        },
      },
      {
        ...base,
        message: {
          type: "location",
          id: "",
          title: "",
          address: "",
          latitude: 0,
          longitude: 0,
        },
      },
      {
        ...base,
        message: { type: "file", id: "", fileName: "", fileSize: "" },
      },
      {
        ...base,
        message: {
          type: "sticker",
          id: "",
          keywords: [],
          packageId: "",
          stickerId: "",
          stickerResourceType: "MESSAGE",
        },
      },
    ];
    for (const test of tests) {
      expect(decideAction(test, new Map())).toBeUndefined();
    }
  });

  it("no actions for empty-if-whitespace-trimmed messages", () => {
    const tests = ["", "  ", " \t \n \r\n ", "　　  　　"];
    for (const test of tests) {
      const event: line.MessageEvent = {
        type: "message",
        replyToken: "",
        source: { type: "user", userId: "" },
        mode: "active",
        timestamp: 0,
        message: { type: "text", id: "", text: test },
      };
      expect(decideAction(event, new Map())).toBeUndefined();
    }
  });

  it("single user text messages are stable diffusion requests", () => {
    type Test = {
      input: { userId: string; messageText: string };
      want: StableDiffusionInJapaneseAction;
    };
    const tests: Test[] = [
      {
        input: { userId: "123456", messageText: "あ" },
        want: {
          type: "stable-diffusion-in-japanese",
          initiatorLineUserId: "123456",
          messageText: "あ",
        },
      },
      {
        input: { userId: "ABC", messageText: "　いろは　\n" },
        want: {
          type: "stable-diffusion-in-japanese",
          initiatorLineUserId: "ABC",
          messageText: "いろは",
        },
      },
    ];
    for (const test of tests) {
      const event: line.MessageEvent = {
        type: "message",
        replyToken: "",
        source: { type: "user", userId: test.input.userId },
        mode: "active",
        timestamp: 0,
        message: { type: "text", id: "", text: test.input.messageText },
      };
      expect(decideAction(event, new Map())).toStrictEqual(test.want);
    }
  });

  // TODO: test cases where user sends a request while previous one is in progress
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
