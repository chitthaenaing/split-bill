export function parseDataUrl(dataUrl: string): {
  buffer: Buffer;
  mime: string;
} | null {
  const match = /^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1];
  const buf = Buffer.from(match[2], "base64");
  if (buf.length === 0) return null;
  return { buffer: buf, mime };
}
