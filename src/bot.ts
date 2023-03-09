import line from "@line/bot-sdk";
import stringz from "stringz";
import { ReplicateClient } from "./replicate.js";
import { TranslateClient } from "./translate.js";

export type BotKind = "development" | "production";

type StableDiffusionInJapaneseAction = {
  type: "stable-diffusion-in-japanese";
  initiatorLineUserId: string;
  messageText: string;
};

type InProgressWarningAction = {
  type: "in-progress-warning";
  replyToken: string;
  actionInProgress: NonImmediateAction;
};

type Action = StableDiffusionInJapaneseAction | InProgressWarningAction;
type NonImmediateAction = StableDiffusionInJapaneseAction;

type ActionsInProgress = Map<string, NonImmediateAction>;

function isDevMessage(msg: line.TextMessage) {
  return msg.text.startsWith("!");
}

/**
 * ┌──────┬────────┬──────────┬──────────┐
 * │ bot  │  user  │ dev msg? │ respond? │
 * ├──────┼────────┼──────────┼──────────┤
 * │ dev  │ dev    │ no       │ no       │
 * │ dev  │ dev    │ yes      │ yes      │
 * │ dev  │ normal │ *        │ no       │
 * │ prod │ dev    │ no       │ yes      │
 * │ prod │ dev    │ yes      │ no       │
 * │ prod │ normal │ *        │ yes      │
 * └──────┴────────┴──────────┴──────────┘
 */
function shouldRespond(
  kind: BotKind,
  isUserDev: boolean,
  isDevMessage: boolean
): boolean {
  const devBotShouldRespond = isUserDev && isDevMessage;
  switch (kind) {
    case "development":
      return devBotShouldRespond;
    case "production":
      return !devBotShouldRespond;
  }
}

function decideAction(
  event: line.WebhookEvent,
  actions: ActionsInProgress,
  botKind: BotKind,
  developerLineUserId: string
): Action | undefined {
  if (
    event.source.type !== "user" ||
    event.type !== "message" ||
    event.message.type !== "text" ||
    !shouldRespond(
      botKind,
      event.source.userId === developerLineUserId,
      isDevMessage(event.message)
    )
  ) {
    return;
  }

  // FIXME: parse, not validate
  const text = isDevMessage(event.message)
    ? event.message.text.slice(1)
    : event.message.text;

  const action = actions.get(event.source.userId);
  if (action !== undefined) {
    return {
      type: "in-progress-warning",
      replyToken: event.replyToken,
      actionInProgress: action,
    };
  } else {
    return {
      type: "stable-diffusion-in-japanese",
      initiatorLineUserId: event.source.userId,
      // FIXME: deny the request if the text is too long
      messageText: text,
    };
  }
}

function trimIfTooLong(s: string, maxLength: number) {
  const len = stringz.length(s);
  if (len <= maxLength) {
    return s;
  } else {
    return stringz.substr(s, 0, maxLength - 1) + "…";
  }
}

export class Bot {
  private readonly actionsInProgress: ActionsInProgress = new Map();

  constructor(
    private readonly kind: BotKind,
    private readonly developerLineUserId: string,
    private readonly lineClient: line.Client,
    private readonly translateClient: TranslateClient,
    private readonly replicateClient: ReplicateClient
  ) {}

  private async handleStableDiffusionInJapaneseAction(
    action: StableDiffusionInJapaneseAction
  ) {
    this.actionsInProgress.set(action.initiatorLineUserId, action);
    await this.lineClient.pushMessage(action.initiatorLineUserId, {
      type: "text",
      text: "🎨 生成中…",
    });
    const en = await this.translateClient.translate(
      action.messageText,
      "ja",
      "en"
    );
    console.log(`${action.messageText} → ${en}`); // TODO
    const urls = await this.replicateClient.callStableDiffusion(en);
    await this.lineClient.pushMessage(action.initiatorLineUserId, [
      { type: "text", text: "🖼️ 完成！" },
      ...urls.map(
        (url): line.ImageMessage => ({
          type: "image",
          previewImageUrl: url,
          originalContentUrl: url,
        })
      ),
    ]);
    this.actionsInProgress.delete(action.initiatorLineUserId);
  }

  private async handleInProgressWarningAction(action: InProgressWarningAction) {
    const prompt = trimIfTooLong(action.actionInProgress.messageText, 30);
    await this.lineClient.replyMessage(action.replyToken, {
      type: "text",
      text: `⚠️ 「${prompt}」を生成中です！`,
    });
  }

  async handleWebhookEvent(event: line.WebhookEvent) {
    const action = decideAction(
      event,
      this.actionsInProgress,
      this.kind,
      this.developerLineUserId
    );
    if (action === undefined) {
      return;
    }
    switch (action.type) {
      case "stable-diffusion-in-japanese":
        return await this.handleStableDiffusionInJapaneseAction(action);
      case "in-progress-warning":
        return await this.handleInProgressWarningAction(action);
    }
  }
}
