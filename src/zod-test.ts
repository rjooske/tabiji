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

const Point = z.object({
  x: z.number(),
  y: z.number(),
});

console.dir(Point.safeParse({ x: 0, y: 1 }));
console.dir(Point.safeParse({ x: 2, y: 3, z: 4 }));
console.dir(Point.safeParse({ x: 2, z: 4 }));

const stringUint8 = z
  .string()
  .transform((e) => parseInt(e))
  .pipe(
    z
      .number()
      .int()
      .gte(0)
      .lt(2 ** 8)
  );

console.dir(stringUint8.safeParse("0"));
console.dir(stringUint8.safeParse("123"));
console.dir(stringUint8.safeParse(""));
console.dir(stringUint8.safeParse("hi"));
console.dir(stringUint8.safeParse("1234876"));
console.dir(stringUint8.safeParse("-1"));
