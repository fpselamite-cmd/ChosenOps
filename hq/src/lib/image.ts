/** Crops an image to a centered square and shrinks it, returning a small JPEG data URL. */
export async function squareImage(file: File, size = 256, quality = 0.82): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  return canvas.toDataURL('image/jpeg', quality);
}

/** Shrinks a screenshot to fit within `max` pixels on its long side, as a JPEG data URL (aspect kept). */
export async function shrinkImage(file: File, max = 1280, quality = 0.72): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  let q = quality;
  let url = canvas.toDataURL('image/jpeg', q);
  // Keep each one under ~380 KB so it fits in a single document.
  while (url.length > 380_000 && q > 0.3) url = canvas.toDataURL('image/jpeg', (q -= 0.1));
  return url;
}
