// Generate all required icon sizes from the new logo PNG
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const iconsDir = join(publicDir, "icons");

const SOURCE = join(publicDir, "logo.png");

const SIZES = [
  32, 48, 64, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512,
];

async function generate() {
  // Ensure icons directory exists
  await mkdir(iconsDir, { recursive: true });

  // Generate each size as PNG
  for (const size of SIZES) {
    await sharp(SOURCE)
      .resize(size, size)
      .png()
      .toFile(join(iconsDir, `icon-${size}.png`));
    console.log(`Generated icon-${size}.png`);
  }

  // Also generate a 32x32 favicon directly in public
  await sharp(SOURCE)
    .resize(32, 32)
    .png()
    .toFile(join(publicDir, "favicon.png"));
  console.log("Generated favicon.png");

  // Generate apple touch icon sizes
  await sharp(SOURCE)
    .resize(180, 180)
    .png()
    .toFile(join(iconsDir, "apple-touch-icon-180.png"));
  console.log("Generated apple-touch-icon-180.png");

  await sharp(SOURCE)
    .resize(152, 152)
    .png()
    .toFile(join(iconsDir, "apple-touch-icon-152.png"));
  console.log("Generated apple-touch-icon-152.png");

  // Generate a smaller logo for navbar/sidebar use
  await sharp(SOURCE)
    .resize(36, 36)
    .png()
    .toFile(join(publicDir, "logo-mark-36.png"));
  console.log("Generated logo-mark-36.png");

  await sharp(SOURCE)
    .resize(48, 48)
    .png()
    .toFile(join(publicDir, "logo-mark-48.png"));
  console.log("Generated logo-mark-48.png");

  // Copy the source as a generic logo.png reference
  console.log("\n✅ All icons generated successfully!");
}

generate().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});
