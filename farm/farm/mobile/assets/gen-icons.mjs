// Rasterize the new brand logo into the PNG assets Expo needs.
// Usage: node assets/gen-icons.mjs   (requires `sharp`)
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = join(__dirname, "..", "..", "frontend", "public", "logo.png");

const here = (name) => join(__dirname, name);

async function run() {
  const srcBuffer = readFileSync(source);

  // 1024x1024 for app icon (Play Store / App Store)
  await sharp(srcBuffer).resize(1024, 1024).png().toFile(here("./icon.png"));
  console.log("Generated icon.png");

  // 48x48 for favicon
  await sharp(srcBuffer).resize(48, 48).png().toFile(here("./favicon.png"));
  console.log("Generated favicon.png");

  // 1024x1024 for adaptive icon (Android)
  await sharp(srcBuffer).resize(1024, 1024).png().toFile(here("./adaptive-icon.png"));
  console.log("Generated adaptive-icon.png");

  // 512x512 for splash screen
  await sharp(srcBuffer).resize(512, 512).png().toFile(here("./splash-icon.png"));
  console.log("Generated splash-icon.png");

  console.log("\n✅ Mobile icons generated successfully!");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
