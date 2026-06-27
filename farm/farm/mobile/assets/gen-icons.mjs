// One-off: rasterize the brand SVGs into the PNG assets Expo needs.
// Usage: node assets/gen-icons.mjs   (requires `sharp`)
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const icon = readFileSync(here("./icon-source.svg"));
const adaptive = readFileSync(here("./adaptive-source.svg"));

async function run() {
  await sharp(icon).resize(1024, 1024).png().toFile(here("./icon.png"));
  await sharp(icon).resize(48, 48).png().toFile(here("./favicon.png"));
  await sharp(adaptive).resize(1024, 1024).png().toFile(here("./adaptive-icon.png"));
  await sharp(icon).resize(512, 512).png().toFile(here("./splash-icon.png"));
  console.log("Icons generated: icon.png, adaptive-icon.png, favicon.png, splash-icon.png");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
