export type TextChunk = {
  text: string;
  page?: number;
};

export function chunkText(
  text: string,
  opts?: { chunkSize?: number; overlap?: number },
): string[] {
  const chunkSize = opts?.chunkSize ?? 900;
  const overlap = opts?.overlap ?? 150;
  if (chunkSize <= 0) return [text];
  if (overlap >= chunkSize) throw new Error("overlap must be < chunkSize");

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) break;
    start = end - overlap;
  }
  return chunks;
}

