/**
 * Reads an image file, centre-crops it to a square (or fits it inside `size` when
 * `square` is false) and returns a compressed data URL small enough to live in a
 * Firestore document.
 */
export async function compressImage(file: File, size = 320, square = true): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const bitmap = await createImageBitmap(file);
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height, dw: number, dh: number;
  if (square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    sw = sh = side;
    dw = dh = Math.min(size, side);
  } else {
    const scale = Math.min(1, size / Math.max(sw, sh));
    dw = Math.round(sw * scale);
    dh = Math.round(sh * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
  bitmap.close();

  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/webp', q);
    if (url.length < 250_000) return url;
  }
  throw new Error('Image is too detailed to store — try a smaller picture.');
}
