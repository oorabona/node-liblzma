/** Create a ReadableStream from a Uint8Array, optionally splitting into chunks */
export function createInputStream(
  data: Uint8Array,
  chunkSize?: number
): ReadableStream<Uint8Array> {
  const size = chunkSize ?? data.byteLength;
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= data.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + size, data.byteLength);
      controller.enqueue(data.slice(offset, end));
      offset = end;
    },
  });
}

/** Collect all chunks from a ReadableStream into a single Uint8Array */
export async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
