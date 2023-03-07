import { Translate } from "@google-cloud/translate/build/src/v2/index.js";
import line from "@line/bot-sdk";
import express from "express";
import { z } from "zod";
import { Bot } from "./bot.js";
import { ReplicateClient } from "./replicate.js";
import { TranslateClient } from "./translate.js";

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

function main() {
  const secrets = Secrets.parse(process.env);
  const port = stringToUint16.parse(process.env.PORT);

  const lineClient = new line.Client({
    channelSecret: secrets.LINE_CHANNEL_SECRET,
    channelAccessToken: secrets.LINE_CHANNEL_ACCESS_TOKEN,
  });
  const translateClient = new TranslateClient(
    new Translate({
      // https://github.com/googleapis/google-cloud-node/blob/main/docs/authentication.md
      credentials: {
        client_email: secrets.GOOGLE_CLOUD_CLIENT_EMAIL,
        private_key: secrets.GOOGLE_CLOUD_PRIVATE_KEY,
      },
    })
  );
  const replicateClient = new ReplicateClient(secrets.REPLICATE_TOKEN);
  const bot = new Bot(lineClient, translateClient, replicateClient);

  const app = express();

  app.post(
    "/webhook",
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    line.middleware({
      channelSecret: secrets.LINE_CHANNEL_SECRET,
      channelAccessToken: secrets.LINE_CHANNEL_ACCESS_TOKEN,
    }),
    (req, res) => {
      // The middleware takes care of parsing the request body
      const { events } = req.body as { events: line.WebhookEvent[] };
      console.dir(events);
      for (const event of events) {
        bot.handleWebhookEvent(event).catch(console.dir);
      }
      res.sendStatus(200);
    }
  );

  app.listen(port, () => console.log(`running on port ${port}`));
}

main();
