import { Translate } from "@google-cloud/translate/build/src/v2/index.js";

type Language = "ja" | "en";

export class TranslateClient {
  constructor(private readonly translateClient: Translate) {}

  async translate(text: string, from: Language, to: Language) {
    const [out] = await this.translateClient.translate(text, { from, to });
    return out;
  }
}
