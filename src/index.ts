import { Translate } from "@google-cloud/translate/build/src/v2/index.js";
import line from "@line/bot-sdk";
import express from "express";
import { writeFile } from "fs/promises";
import fetch from "node-fetch";
import { basename } from "path";
import { predict } from "replicate-api";
import { z } from "zod";

const LANGUAGE_CODE_JAPANESE = "ja";
const LANGUAGE_CODE_ENGLISH = "en";

const sdOutputSchema = z.array(z.string().url());

async function sd(token: string, prompt: string) {
  const res = await predict({
    token,
    model: "stability-ai/stable-diffusion",
    input: { prompt, num_outputs: 4 },
    poll: true,
  });
  return sdOutputSchema.parse(res.output);
}

const zNonEmptyString = () => z.string().min(1);

const Secrets = z.object({
  GOOGLE_CLOUD_CLIENT_EMAIL: zNonEmptyString().email(),
  GOOGLE_CLOUD_PRIVATE_KEY: zNonEmptyString(),
  REPLICATE_TOKEN: zNonEmptyString(),
  LINE_CHANNEL_SECRET: zNonEmptyString(),
  LINE_CHANNEL_ACCESS_TOKEN: zNonEmptyString(),
});

const stringToUint16 = z
  .string()
  .transform((e) => parseInt(e))
  .pipe(
    z
      .number()
      .int()
      .gte(0)
      .lt(2 ** 16)
  );

async function main() {
  const secrets = Secrets.parse(process.env);
  const port = stringToUint16.parse(process.env.PORT);

  const lineClient = new line.Client({
    channelSecret: secrets.LINE_CHANNEL_SECRET,
    channelAccessToken: secrets.LINE_CHANNEL_ACCESS_TOKEN,
  });

  const app = express();

  app.post(
    "/webhook",
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    line.middleware({
      channelSecret: secrets.LINE_CHANNEL_SECRET,
      channelAccessToken: secrets.LINE_CHANNEL_ACCESS_TOKEN,
    }),
    (req, res) => {
      const { events } = req.body as { events: line.WebhookEvent[] };
      console.dir(events);

      for (const event of events) {
        if (event.type === "message" && event.message.type === "text") {
          lineClient
            .replyMessage(event.replyToken, {
              type: "text",
              text: event.message.text.toUpperCase(),
            })
            .then(console.dir)
            .catch(console.dir);
        }
      }

      res.sendStatus(200);
    }
  );

  app.listen(port, () => console.log(`running on port ${port}`));

  return;

  const translate = new Translate({
    // https://github.com/googleapis/google-cloud-node/blob/main/docs/authentication.md
    credentials: {
      client_email: secrets.GOOGLE_CLOUD_CLIENT_EMAIL,
      private_key: secrets.GOOGLE_CLOUD_PRIVATE_KEY,
    },
  });

  const [en] = await translate.translate(
    "馬に乗っている宇宙飛行士、HD、ダイナミックな照明",
    {
      from: LANGUAGE_CODE_JAPANESE,
      to: LANGUAGE_CODE_ENGLISH,
    }
  );

  const urls = await sd(secrets.REPLICATE_TOKEN, en);

  await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      await writeFile(basename(url), Buffer.from(buf));
    })
  );
}

void main();
