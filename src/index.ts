import { Translate } from "@google-cloud/translate/build/src/v2/index.js";
import line from "@line/bot-sdk";
import chokidar from "chokidar";
import express from "express";
import { Console } from "node:console";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { z } from "zod";
import { Bot } from "./bot.js";
import { ReplicateClient } from "./replicate.js";
import { TranslateClient } from "./translate.js";

const stderr = new Console(process.stderr);

const zNonEmptyString = () => z.string().min(1);

const secretsSchema = z.object({
  GOOGLE_CLOUD_CLIENT_EMAIL: zNonEmptyString().email(),
  GOOGLE_CLOUD_PRIVATE_KEY: zNonEmptyString(),
  REPLICATE_TOKEN: zNonEmptyString(),
  LINE_CHANNEL_SECRET: zNonEmptyString(),
  LINE_CHANNEL_ACCESS_TOKEN: zNonEmptyString(),
  DEVELOPER_LINE_USER_ID: zNonEmptyString(),
  BOT_KIND: z.literal("development").or(z.literal("production")),
});

type SslFilePaths = { certPath: string; keyPath: string };
type SslFiles = { cert: string; key: string };

const sslFilePathsSchema = z
  .object({
    SSL_CERTIFICATE_PATH: z.optional(z.string()),
    SSL_KEY_PATH: z.optional(z.string()),
  })
  .transform((paths): SslFilePaths | undefined => {
    if (
      paths.SSL_CERTIFICATE_PATH !== undefined &&
      paths.SSL_KEY_PATH !== undefined
    ) {
      return {
        certPath: paths.SSL_CERTIFICATE_PATH,
        keyPath: paths.SSL_KEY_PATH,
      };
    }
  });

function readSslFiles(paths: SslFilePaths): SslFiles {
  return {
    cert: fs.readFileSync(paths.certPath, { encoding: "utf8" }),
    key: fs.readFileSync(paths.keyPath, { encoding: "utf8" }),
  };
}

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
  // Either we have all the secrets or fail immediately
  const secrets = secretsSchema.parse(process.env);
  const sslFilePaths = sslFilePathsSchema.parse(process.env);
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

  if (sslFilePaths !== undefined) {
    const httpsServer = https.createServer(readSslFiles(sslFilePaths), app);
    httpsServer.listen({ port }, () =>
      console.log(`listening on port ${port} in https`)
    );
    // Reload the certificate and the key after they get renewed automatically
    // https://stackoverflow.com/a/74076392
    chokidar.watch([sslFilePaths.certPath]).on("all", () => {
      // Wait for a bit just to be sure that both the certificate and the key
      // have been changed
      setTimeout(
        () => httpsServer.setSecureContext(readSslFiles(sslFilePaths)),
        10 * 1000
      );
    });
  } else {
    const httpServer = http.createServer(app);
    httpServer.listen({ port }, () =>
      console.log(`listening on port ${port} in http`)
    );
  }
}

main();
