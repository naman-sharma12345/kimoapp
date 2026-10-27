export const MULTIPART_THRESHOLD = 100 * 1024 ** 2;
export const UPLOAD_PART_BYTES = 16 * 1024 ** 2;
export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;
export function uploadParts(size: number) {
  return Array.from(
    { length: Math.ceil(size / UPLOAD_PART_BYTES) },
    (_, index) => ({
      partNumber: index + 1,
      start: index * UPLOAD_PART_BYTES,
      end: Math.min(size, (index + 1) * UPLOAD_PART_BYTES),
    }),
  );
}
