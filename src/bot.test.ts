import line from "@line/bot-sdk";
import {
  AnythingV4InJapaneseAction,
  CancelAction,
  ChooseAiOrCancelAction,
  exportedForTesting,
  InProgressWarningAction,
  NonImmediateAction,
  StableDiffusionInJapaneseAction,
  TextTooLongWarningAction,
} from "./bot.js";

const {
  decideAction,
  decideActionFromMessageEvent,
  decideActionFromPostbackEvent,
  trimIfTooLong,
} = exportedForTesting;

describe("decide actions", () => {
  it("no actions for events other than message and postback", () => {
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

  it("no actions for non single user events", () => {
    const messageEventBase: Omit<line.MessageEvent, "source"> = {
      type: "message",
      replyToken: "",
      message: { type: "text", text: "foo", id: "" },
      mode: "active",
      timestamp: 0,
    };
    const postbackBase: Omit<line.PostbackEvent, "source"> = {
      type: "postback",
      replyToken: "",
      postback: { data: "" },
      mode: "active",
      timestamp: 0,
    };
    const tests: (line.MessageEvent | line.PostbackEvent)[] = [
      { ...messageEventBase, source: { type: "room", roomId: "" } },
      { ...messageEventBase, source: { type: "group", groupId: "" } },
      { ...postbackBase, source: { type: "room", roomId: "" } },
      { ...postbackBase, source: { type: "group", groupId: "" } },
    ];
    for (const test of tests) {
      expect(decideAction(test, new Map())).toBeUndefined();
    }
  });

  it("no actions for non text message events", () => {
    const tests: line.EventMessage[] = [
      { type: "image", id: "", contentProvider: { type: "line" } },
      { type: "video", id: "", contentProvider: { type: "line" } },
      { type: "audio", id: "", duration: 0, contentProvider: { type: "line" } },
      {
        type: "location",
        id: "",
        title: "",
        address: "",
        latitude: 0,
        longitude: 0,
      },
      { type: "file", id: "", fileName: "", fileSize: "" },
      {
        type: "sticker",
        id: "",
        keywords: [],
        packageId: "",
        stickerId: "",
        stickerResourceType: "MESSAGE",
      },
    ];
    for (const test of tests) {
      const event: line.MessageEvent = {
        type: "message",
        replyToken: "",
        message: test,
        source: { type: "user", userId: "" },
        mode: "active",
        timestamp: 0,
      };
      expect(decideActionFromMessageEvent(event, new Map())).toBeUndefined();
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

  it("ask which AI to use or cancel for single user text messages", () => {
    type Test = {
      input: { replyToken: string; messageText: string };
      want: ChooseAiOrCancelAction;
    };
    const tests: Test[] = [
      {
        input: { replyToken: "123456", messageText: "あ" },
        want: {
          type: "choose-ai-or-cancel",
          replyToken: "123456",
          prompt: "あ",
        },
      },
      {
        input: { replyToken: "ABC", messageText: "　いろは　\n" },
        want: {
          type: "choose-ai-or-cancel",
          replyToken: "ABC",
          prompt: "いろは",
        },
      },
    ];
    for (const test of tests) {
      const event: line.MessageEvent = {
        type: "message",
        replyToken: test.input.replyToken,
        source: { type: "user", userId: "" },
        mode: "active",
        timestamp: 0,
        message: { type: "text", id: "", text: test.input.messageText },
      };
      expect(decideAction(event, new Map())).toStrictEqual(test.want);
    }
  });

  it("users can send only 1 request at a time", () => {
    const base: line.MessageEvent = {
      type: "message",
      replyToken: "",
      message: { type: "text", id: "", text: "てすと" },
      mode: "active",
      timestamp: 0,
      source: { type: "user", userId: "" },
    };
    type Test = {
      input: {
        event: line.MessageEvent;
        actionsInProgress: NonImmediateAction[];
      };
      want: ChooseAiOrCancelAction | InProgressWarningAction;
    };
    const tests: Test[] = [
      {
        input: {
          event: {
            ...base,
            source: { type: "user", userId: "aaa" },
            message: { type: "text", id: "", text: "かきくけこ" },
            replyToken: "token",
          },
          actionsInProgress: [],
        },
        want: {
          type: "choose-ai-or-cancel",
          prompt: "かきくけこ",
          replyToken: "token",
        },
      },
      {
        input: {
          event: {
            ...base,
            source: { type: "user", userId: "user1" },
            replyToken: "i am token",
          },
          actionsInProgress: [
            {
              type: "stable-diffusion-in-japanese",
              initiatorLineUserId: "user1",
              prompt: "あ",
            },
          ],
        },
        want: {
          type: "in-progress-warning",
          replyToken: "i am token",
          actionInProgress: {
            type: "stable-diffusion-in-japanese",
            initiatorLineUserId: "user1",
            prompt: "あ",
          },
        },
      },
      {
        input: {
          event: {
            ...base,
            source: { type: "user", userId: "I am a user" },
            message: { type: "text", id: "", text: "お" },
            replyToken: "TOUCAN",
          },
          actionsInProgress: [
            {
              type: "stable-diffusion-in-japanese",
              initiatorLineUserId: "I am a different user",
              prompt: "あ",
            },
          ],
        },
        want: {
          type: "choose-ai-or-cancel",
          replyToken: "TOUCAN",
          prompt: "お",
        },
      },
    ];
    for (const { input, want } of tests) {
      expect(
        decideActionFromMessageEvent(
          input.event,
          new Map(
            input.actionsInProgress.map((e) => [e.initiatorLineUserId, e])
          )
        )
      ).toStrictEqual(want);
    }
  });

  it("reject text messages that are too long", () => {
    type Test = {
      input: { replyToken: string; messageText: string };
      want: TextTooLongWarningAction | ChooseAiOrCancelAction;
    };
    const tests: Test[] = [
      {
        input: { replyToken: "QWERTY", messageText: "\nshort enough\n" },
        want: {
          type: "choose-ai-or-cancel",
          replyToken: "QWERTY",
          prompt: "short enough",
        },
      },
      {
        input: {
          replyToken: "ALMOST TOO LONG",
          messageText: "　 \t" + "👍🏻".repeat(100) + "\t\r\n",
        },
        want: {
          type: "choose-ai-or-cancel",
          replyToken: "ALMOST TOO LONG",
          prompt: "👍🏻".repeat(100),
        },
      },
      {
        input: {
          replyToken: "too long by 1 character",
          messageText: "　 \t" + "⚠️".repeat(101) + "\t\r\n",
        },
        want: {
          type: "text-too-long-warning",
          replyToken: "too long by 1 character",
          maxLength: 100,
        },
      },
      {
        input: {
          replyToken: "abc",
          messageText: "\tDEFINITELY TOO LONG\n".repeat(100),
        },
        want: {
          type: "text-too-long-warning",
          replyToken: "abc",
          maxLength: 100,
        },
      },
    ];
    for (const test of tests) {
      const event: line.MessageEvent = {
        type: "message",
        replyToken: test.input.replyToken,
        source: { type: "user", userId: "" },
        mode: "active",
        timestamp: 0,
        message: { type: "text", id: "", text: test.input.messageText },
      };
      expect(decideAction(event, new Map())).toStrictEqual(test.want);
    }
  });

  it("only respond to postback events with correct data", () => {
    const base: line.PostbackEvent = {
      type: "postback",
      replyToken: "",
      postback: { data: "" },
      source: { type: "user", userId: "" },
      mode: "active",
      timestamp: 0,
    };
    type Test = {
      input: line.PostbackEvent;
      want:
        | CancelAction
        | StableDiffusionInJapaneseAction
        | AnythingV4InJapaneseAction
        | undefined;
    };
    const tests: Test[] = [
      { input: { ...base, postback: { data: "" } }, want: undefined },
      {
        input: { ...base, postback: { data: "malformed json" } },
        want: undefined,
      },
      {
        input: {
          ...base,
          postback: {
            data: JSON.stringify({ not_malformed: "but_wrong_shape" }),
          },
        },
        want: undefined,
      },
      {
        input: {
          ...base,
          postback: { data: JSON.stringify({ type: "some-unknown-type" }) },
        },
        want: undefined,
      },
      {
        input: {
          ...base,
          postback: {
            data: JSON.stringify({
              type: "stable-diffusion",
              this_payload_is_incomplete: true,
            }),
          },
        },
        want: undefined,
      },
      {
        input: {
          ...base,
          postback: {
            data: JSON.stringify({
              type: "anything-v4",
              is_bad_data: true,
              is_my_fault: "hopefully-false",
            }),
          },
        },
        want: undefined,
      },
      {
        input: {
          ...base,
          postback: { data: JSON.stringify({ type: "cancel" }) },
          replyToken: "AAAA",
        },
        want: { type: "cancel", replyToken: "AAAA" },
      },
      {
        input: {
          ...base,
          postback: {
            data: JSON.stringify({
              type: "stable-diffusion",
              prompt: "テスト",
            }),
          },
          source: { type: "user", userId: "IAmPlaceholder" },
        },
        want: {
          type: "stable-diffusion-in-japanese",
          initiatorLineUserId: "IAmPlaceholder",
          prompt: "テスト",
        },
      },
      {
        input: {
          ...base,
          postback: {
            data: JSON.stringify({
              type: "anything-v4",
              prompt: "いろはにほへと",
            }),
          },
          source: { type: "user", userId: "schwa" },
        },
        want: {
          type: "anything-v4-in-japanese",
          initiatorLineUserId: "schwa",
          prompt: "いろはにほへと",
        },
      },
    ];
    for (const { input, want } of tests) {
      expect(decideActionFromPostbackEvent(input)).toStrictEqual(want);
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
