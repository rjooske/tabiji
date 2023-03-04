import { Translate } from "@google-cloud/translate/build/src/v2";

const LANGUAGE_CODE_JAPANESE = "ja";
const LANGUAGE_CODE_ENGLISH = "en";

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

  console.log(en);
}

void main();
