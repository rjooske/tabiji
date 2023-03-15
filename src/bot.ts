import { Translate } from "@google-cloud/translate/build/src/v2/index.js";
import line from "@line/bot-sdk";
import stringz from "stringz";
import { z } from "zod";
import { ReplicateClient } from "./replicate.js";

export type ChooseAiOrCancelAction = {
  type: "choose-ai-or-cancel";
  replyToken: string;
  prompt: string;
};

export type CancelAction = { type: "cancel"; replyToken: string };

export type StableDiffusionInJapaneseAction = {
  type: "stable-diffusion-in-japanese";
  initiatorLineUserId: string;
  prompt: string;
};

export type AnythingV4InJapaneseAction = {
  type: "anything-v4-in-japanese";
  initiatorLineUserId: string;
  prompt: string;
};

export type TextTooLongWarningAction = {
  type: "text-too-long-warning";
  replyToken: string;
  maxLength: number;
};

export type InProgressWarningAction = {
  type: "in-progress-warning";
  replyToken: string;
  actionInProgress: NonImmediateAction;
};

export type Action =
  | ChooseAiOrCancelAction
  | CancelAction
  | StableDiffusionInJapaneseAction
  | AnythingV4InJapaneseAction
  | TextTooLongWarningAction
  | InProgressWarningAction;
export type NonImmediateAction =
  | StableDiffusionInJapaneseAction
  | AnythingV4InJapaneseAction;

export type ActionsInProgress = Map<string, NonImmediateAction>;

const STABLE_DIFFUSION_PROMPT_MAX_LENGTH = 100;

function decideActionFromMessageEvent(
  event: line.MessageEvent,
  actions: ActionsInProgress
):
  | ChooseAiOrCancelAction
  | TextTooLongWarningAction
  | InProgressWarningAction
  | undefined {
  if (event.source.type !== "user" || event.message.type !== "text") {
    return;
  }

  const text = event.message.text.trim();
  const textLength = stringz.length(text);
  if (text.length === 0) {
    // Not sure if someone can send a text message that contains only
    // whitespace characters but just in case
    return;
  } else if (textLength > STABLE_DIFFUSION_PROMPT_MAX_LENGTH) {
    return {
      type: "text-too-long-warning",
      replyToken: event.replyToken,
      maxLength: STABLE_DIFFUSION_PROMPT_MAX_LENGTH,
    };
  }

  const action = actions.get(event.source.userId);
  if (action !== undefined) {
    return {
      type: "in-progress-warning",
      replyToken: event.replyToken,
      actionInProgress: action,
    };
  }

  return {
    type: "choose-ai-or-cancel",
    replyToken: event.replyToken,
    prompt: text,
  };
}

const cancelPostbackActionSchema = z.object({ type: z.literal("cancel") });
const stableDiffusionPostbackActionSchema = z.object({
  type: z.literal("stable-diffusion"),
  prompt: z.string().min(1),
});
const anythingV4PostbackActionSchema = z.object({
  type: z.literal("anything-v4"),
  prompt: z.string().min(1),
});
const postbackActionSchema = cancelPostbackActionSchema
  .or(stableDiffusionPostbackActionSchema)
  .or(anythingV4PostbackActionSchema);

function parsePostbackData(s: string) {
  try {
    return postbackActionSchema.parse(JSON.parse(s));
  } catch {
    return;
  }
}

function decideActionFromPostbackEvent(
  event: line.PostbackEvent
):
  | CancelAction
  | StableDiffusionInJapaneseAction
  | AnythingV4InJapaneseAction
  | undefined {
  if (event.source.type !== "user") {
    return;
  }

  const data = parsePostbackData(event.postback.data);
  if (data === undefined) {
    return;
  }

  switch (data.type) {
    case "cancel":
      return { type: "cancel", replyToken: event.replyToken };
    case "stable-diffusion":
      return {
        type: "stable-diffusion-in-japanese",
        initiatorLineUserId: event.source.userId,
        prompt: data.prompt,
      };
    case "anything-v4":
      return {
        type: "anything-v4-in-japanese",
        initiatorLineUserId: event.source.userId,
        prompt: data.prompt,
      };
  }
}

function decideAction(
  event: line.WebhookEvent,
  actions: ActionsInProgress
): Action | undefined {
  if (event.source.type !== "user") {
    return;
  }
  switch (event.type) {
    case "message":
      return decideActionFromMessageEvent(event, actions);
    case "postback":
      return decideActionFromPostbackEvent(event);
    default:
      return;
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

const LANGUAGE_CODE_JAPANESE = "ja";
const LANGUAGE_CODE_ENGLISH = "en";

export class Bot {
  private readonly actionsInProgress: ActionsInProgress = new Map();

  constructor(
    private readonly lineClient: line.Client,
    private readonly translateClient: Translate,
    private readonly replicateClient: ReplicateClient
  ) {}

  private async handleChooseAiOrCancelAction(action: ChooseAiOrCancelAction) {
    const promptPreview = trimIfTooLong(action.prompt, 30);
    const replyText = `
🖌️ 「${promptPreview}」を生成します！使用するAIを選択してください
• Stable Diffusion: 様々なスタイルに対応した汎用AIです
• Anything V4: アニメ風の画像を作るのが得意です
`.trim();
    await this.lineClient.replyMessage(action.replyToken, {
      type: "text",
      text: replyText,
      // TODO: hmmmmm
      quickReply: {
        items: [
          {
            type: "action",
            action: {
              type: "postback",
              label: "キャンセル",
              displayText: "キャンセル",
              data: JSON.stringify({ type: "cancel" }),
            },
          },
          {
            type: "action",
            action: {
              type: "postback",
              label: "Stable Diffusion",
              displayText: "Stable Diffusion",
              data: JSON.stringify({
                type: "stable-diffusion",
                prompt: action.prompt,
              }),
            },
          },
          {
            type: "action",
            action: {
              type: "postback",
              label: "Anything V4",
              displayText: "Anything V4",
              data: JSON.stringify({
                type: "anything-v4",
                prompt: action.prompt,
              }),
            },
          },
        ],
      },
    });
  }

  private async handleCancelAction(action: CancelAction) {
    await this.lineClient.replyMessage(action.replyToken, {
      type: "text",
      text: "✅ キャンセルしました！",
    });
  }

  private async handleStableDiffusionInJapaneseAction(
    action: StableDiffusionInJapaneseAction
  ) {
    this.actionsInProgress.set(action.initiatorLineUserId, action);
    await this.lineClient.pushMessage(action.initiatorLineUserId, {
      type: "text",
      text: "🎨 生成中…",
    });
    const [en] = await this.translateClient.translate(action.prompt, {
      from: LANGUAGE_CODE_JAPANESE,
      to: LANGUAGE_CODE_ENGLISH,
    });
    console.log(`${action.prompt} → ${en}`); // TODO
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

  private async handleAnythingV4InJapaneseAction(
    action: AnythingV4InJapaneseAction
  ) {
    this.actionsInProgress.set(action.initiatorLineUserId, action);
    await this.lineClient.pushMessage(action.initiatorLineUserId, {
      type: "text",
      text: "🎨 生成中…",
    });
    const [en] = await this.translateClient.translate(action.prompt, {
      from: LANGUAGE_CODE_JAPANESE,
      to: LANGUAGE_CODE_ENGLISH,
    });
    console.log(`${action.prompt} → ${en}`); // TODO
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
    const prompt = trimIfTooLong(action.actionInProgress.prompt, 30);
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
      case "choose-ai-or-cancel":
        return await this.handleChooseAiOrCancelAction(action);
      case "cancel":
        return await this.handleCancelAction(action);
      case "stable-diffusion-in-japanese":
        return await this.handleStableDiffusionInJapaneseAction(action);
      case "anything-v4-in-japanese":
        return await this.handleAnythingV4InJapaneseAction(action);
      case "in-progress-warning":
        return await this.handleInProgressWarningAction(action);
      case "text-too-long-warning":
        return await this.handleTextTooLongWarningAction(action);
    }
  }
}

export const exportedForTesting = {
  decideAction,
  decideActionFromMessageEvent,
  decideActionFromPostbackEvent,
  trimIfTooLong,
};
