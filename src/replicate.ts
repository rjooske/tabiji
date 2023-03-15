import { predict } from "replicate-api";
import { z } from "zod";

const stableDiffusionOutputSchema = z.array(z.string().url());
const anythingV4OutputSchema = z.array(z.string().url());

export class ReplicateClient {
  constructor(private readonly token: string) {}

  async callStableDiffusion(prompt: string) {
    const { output } = await predict({
      token: this.token,
      model: "stability-ai/stable-diffusion",
      input: { prompt, num_outputs: 4 },
      poll: true,
    });
    return stableDiffusionOutputSchema.parse(output);
  }

  async callAnythingV4(prompt: string) {
    const { output } = await predict({
      token: this.token,
      model: "cjwbw/anything-v4.0",
      input: { prompt, num_outputs: 4 },
      poll: true,
    });
    return anythingV4OutputSchema.parse(output);
  }
}
