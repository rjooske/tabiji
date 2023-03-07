import line from "@line/bot-sdk";
import { ReplicateClient } from "./replicate.js";
import { TranslateClient } from "./translate.js";

type StableDiffusionInJapaneseAction = {
  type: "stable-diffusion-in-japanese";
  initiatorLineUserId: string;
  messageText: string;
};

type Action = StableDiffusionInJapaneseAction;

function webhookEventToAction(event: line.WebhookEvent): Action | undefined {
  if (
    event.source.type === "user" &&
    event.type === "message" &&
    event.message.type === "text"
  ) {
    return {
      type: "stable-diffusion-in-japanese",
      initiatorLineUserId: event.source.userId,
      messageText: event.message.text,
    };
  }
}

export class Bot {
  constructor(
    private readonly lineClient: line.Client,
    private readonly translateClient: TranslateClient,
    private readonly replicateClient: ReplicateClient
  ) {}

  private async handleStableDiffusionInJapaneseAction(
    action: StableDiffusionInJapaneseAction
  ) {
    await this.lineClient.pushMessage(action.initiatorLineUserId, {
      type: "text",
      text: "生成中…",
    });
    const en = await this.translateClient.translate(
      action.messageText,
      "ja",
      "en"
    );
    const urls = await this.replicateClient.callStableDiffusion(en);
    await this.lineClient.pushMessage(
      action.initiatorLineUserId,
      urls.map((url) => ({
        type: "image",
        previewImageUrl: url,
        originalContentUrl: url,
      }))
    );
  }

  async handleWebhookEvent(event: line.WebhookEvent) {
    const action = webhookEventToAction(event);
    if (action === undefined) {
      return;
    }
    switch (action.type) {
      case "stable-diffusion-in-japanese":
        return await this.handleStableDiffusionInJapaneseAction(action);
    }
  }
}
