import { z } from "zod";

const schema = z.array(z.string().url()).length(4);

const output: unknown = [
  "https://replicate.delivery/pbxt/BBitBpbW1mabB1Ds6oebgCQDju7PJgbS1SNktjjML5LjbJSIA/out-0.png",
  "https://replicate.delivery/pbxt/cIqgpFYajYqmA11Ers7FWA7TljWL9imEostLpR9W9ZvxtEJE/out-1.png",
  "https://replicate.delivery/pbxt/igTRoBBnpqLUMJL0XDifHrRbfhD7UvtaLYccVyt9AjfOulIhA/out-2.png",
  "https://replicate.delivery/pbxt/6QYdgvPQBj7TJhZOuiYqB4JP80POUrMMNRkYEAmdebIkbJSIA/out-3.png",
];

const parsed = schema.safeParse(output);

console.dir(parsed);
