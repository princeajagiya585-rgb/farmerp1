// Client-side photo compression. Every photo picked from disk or captured by
// the camera anywhere in the app goes through compressImage() before upload,
// so uploads land in roughly the 100–250 KB range while staying visually
// sharp. Non-image files (PDFs, …) and already-small images pass through
// untouched, and ANY failure falls back to uploading the original file.

const HARD_MAX_BYTES = 250 * 1024; // never upload an image above ~250 KB
const TARGET_BYTES = 200 * 1024; // aim for ~200 KB
const SKIP_BELOW_BYTES = 100 * 1024; // already small enough — leave as-is
const MAX_DIMENSION = 1600; // longest side; keeps bills/text readable
const MIN_QUALITY = 0.45; // floor so the picture stays clear

// Decode a Blob into something drawable on a canvas, honouring EXIF rotation
// where the browser supports it (phone photos are often stored rotated).
async function loadDrawable(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      /* fall through to <img> below */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

const toJpegBlob = (canvas, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

// Draw at `scale` and walk the JPEG quality down until the blob fits
// `targetBytes` (or the quality floor is hit). Returns the smallest blob made.
async function encodeAtScale(drawable, scale, targetBytes) {
  const w = Math.max(1, Math.round(drawable.width * scale));
  const h = Math.max(1, Math.round(drawable.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(drawable, 0, 0, w, h);
  let best = null;
  for (let q = 0.85; q >= MIN_QUALITY - 0.001; q -= 0.1) {
    const blob = await toJpegBlob(canvas, q);
    if (!blob) break;
    if (!best || blob.size < best.size) best = blob;
    if (blob.size <= targetBytes) break;
  }
  return best;
}

/**
 * Compress an image File/Blob to a small, clear JPEG.
 * Returns a new File, or the original file when compression isn't needed,
 * isn't possible (non-image), or fails.
 */
export async function compressImage(file, { targetBytes = TARGET_BYTES, maxDimension = MAX_DIMENSION } = {}) {
  try {
    if (!(file instanceof Blob) || !file.type?.startsWith("image/")) return file;
    if (file.size <= SKIP_BELOW_BYTES) return file;

    const drawable = await loadDrawable(file);
    let scale = Math.min(1, maxDimension / Math.max(drawable.width, drawable.height));
    let blob = null;
    // If the quality loop alone can't get under the hard ceiling (huge
    // originals), shrink the dimensions and try again a couple of times.
    for (let attempt = 0; attempt < 5; attempt++) {
      blob = await encodeAtScale(drawable, scale, targetBytes);
      if (blob && blob.size <= HARD_MAX_BYTES) break;
      scale *= 0.75;
    }
    if (drawable.close) drawable.close();
    if (!blob || blob.size >= file.size) return file; // never make it bigger

    const base = (file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
