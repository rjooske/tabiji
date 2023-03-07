import line from "@line/bot-sdk";
import stringz from "stringz";
import { ReplicateClient } from "./replicate.js";
import { TranslateClient } from "./translate.js";

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

function decideAction(
  actions: ActionsInProgress,
  event: line.WebhookEvent
): Action | undefined {
  if (
    event.source.type !== "user" ||
    event.type !== "message" ||
    event.message.type !== "text"
  ) {
    return;
  }

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
      messageText: event.message.text.trim(),
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
    const action = decideAction(this.actionsInProgress, event);
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
