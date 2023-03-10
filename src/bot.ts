import { Translate } from "@google-cloud/translate/build/src/v2/index.js";
import line from "@line/bot-sdk";
import stringz from "stringz";
import { ReplicateClient } from "./replicate.js";

export type StableDiffusionInJapaneseAction = {
  type: "stable-diffusion-in-japanese";
  initiatorLineUserId: string;
  messageText: string;
};

type TextTooLongWarningAction = {
  type: "text-too-long-warning";
  replyToken: string;
  maxLength: number;
};

type InProgressWarningAction = {
  type: "in-progress-warning";
  replyToken: string;
  actionInProgress: NonImmediateAction;
};

type Action =
  | StableDiffusionInJapaneseAction
  | TextTooLongWarningAction
  | InProgressWarningAction;
type NonImmediateAction = StableDiffusionInJapaneseAction;

type ActionsInProgress = Map<string, NonImmediateAction>;

const STABLE_DIFFUSION_PROMPT_MAX_LENGTH = 200;

function decideAction(
  event: line.WebhookEvent,
  actions: ActionsInProgress
): Action | undefined {
  if (
    event.source.type !== "user" ||
    event.type !== "message" ||
    event.message.type !== "text"
  ) {
    return;
  }

  const text = event.message.text.trim();
  if (text.length === 0) {
    return;
  }

  const action = actions.get(event.source.userId);
  if (action !== undefined) {
    return {
      type: "in-progress-warning",
      replyToken: event.replyToken,
      actionInProgress: action,
    };
  }
  if (stringz.length(text) > STABLE_DIFFUSION_PROMPT_MAX_LENGTH) {
    return {
      type: "text-too-long-warning",
      replyToken: event.replyToken,
      maxLength: STABLE_DIFFUSION_PROMPT_MAX_LENGTH,
    };
  }
  return {
    type: "stable-diffusion-in-japanese",
    initiatorLineUserId: event.source.userId,
    messageText: text,
  };
}

function trimIfTooLong(s: string, maxLength: number) {
  const len = stringz.length(s);
  if (len <= maxLength) {
    return s;
  } else {
    return stringz.substr(s, 0, maxLength - 1) + "…";
  }
}

const LANGUAGE_CODE_JAPANESE = "ja";
const LANGUAGE_CODE_ENGLISH = "en";

export class Bot {
  private readonly actionsInProgress: ActionsInProgress = new Map();

  constructor(
    private readonly lineClient: line.Client,
    private readonly translateClient: Translate,
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
    const [en] = await this.translateClient.translate(action.messageText, {
      from: LANGUAGE_CODE_JAPANESE,
      to: LANGUAGE_CODE_ENGLISH,
    });
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

  private async handleTextTooLongWarningAction(
    action: TextTooLongWarningAction
  ) {
    await this.lineClient.replyMessage(action.replyToken, {
      type: "text",
      text: `⚠️ 文章が長すぎます！最大${action.maxLength}文字までです`,
    });
  }

  private async handleInProgressWarningAction(action: InProgressWarningAction) {
    const prompt = trimIfTooLong(action.actionInProgress.messageText, 30);
    await this.lineClient.replyMessage(action.replyToken, {
      type: "text",
      text: `⚠️ 「${prompt}」を生成中です！`,
    });
  }

  async handleWebhookEvent(event: line.WebhookEvent) {
    const action = decideAction(event, this.actionsInProgress);
    if (action === undefined) {
      return;
    }
    switch (action.type) {
      case "stable-diffusion-in-japanese":
        return await this.handleStableDiffusionInJapaneseAction(action);
      case "in-progress-warning":
        return await this.handleInProgressWarningAction(action);
      case "text-too-long-warning":
        return await this.handleTextTooLongWarningAction(action);
    }
  }
}

export const exportedForTesting = { decideAction, trimIfTooLong };
