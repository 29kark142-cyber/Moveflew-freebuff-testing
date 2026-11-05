// Downscales camera photos before they are stored as data URLs in the job record.
// Keeping one implementation means the field app and the inspection log shrink
// images the same way (and stay small enough for offline IndexedDB replay).
export async function shrinkImage(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo processing unavailable");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return canvas.toDataURL("image/jpeg", 0.7);
}
