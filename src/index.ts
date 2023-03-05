import { Translate } from "@google-cloud/translate/build/src/v2/index.js";
import { writeFile } from "fs/promises";
import fetch from "node-fetch";
import { basename } from "path";
import { predict } from "replicate-api";

const LANGUAGE_CODE_JAPANESE = "ja";
const LANGUAGE_CODE_ENGLISH = "en";

async function sd(token: string, prompt: string) {
  const res = await predict({
    token,
    model: "stability-ai/stable-diffusion",
    input: { prompt, num_outputs: 4 },
    poll: true,
  });
  // FIXME:
  const urls = res.output as string[];
  return urls;
}

async function main() {
  const translate = new Translate({
    // https://github.com/googleapis/google-cloud-node/blob/main/docs/authentication.md
    credentials: {
      client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY,
    },
  });

  const [en] = await translate.translate(
    "馬に乗っている宇宙飛行士、HD、ダイナミックな照明",
    {
      from: LANGUAGE_CODE_JAPANESE,
      to: LANGUAGE_CODE_ENGLISH,
    }
  );

  const urls = await sd(process.env.REPLICATE_TOKEN ?? "", en);

  await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      await writeFile(basename(url), Buffer.from(buf));
    })
  );
}

void main();
