import { createHash } from "node:crypto";
import { HttpError } from "./http";
import { getDataStore } from "./store";

function anonymize(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export async function enforceRateLimit(options: {
  bucket: string;
  subject: string;
  limit: number;
  windowSeconds: number;
}) {
  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;
  const windowId = Math.floor(now / windowMs);
  const key =
    "rate/" +
    options.bucket +
    "/" +
    anonymize(options.subject) +
    "/" +
    windowId;
  const store = await getDataStore();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await store.getJson<{ count: number }>(key);
    const nextCount = (current?.value.count ?? 0) + 1;
    if (nextCount > options.limit) {
      throw new HttpError(
        429,
        "RATE_LIMITED",
        "มีการใช้งานถี่เกินไป กรุณารอสักครู่",
      );
    }

    const result = await store.setJson(
      key,
      { count: nextCount, windowId },
      current
        ? { onlyIfMatch: current.etag }
        : { onlyIfNew: true },
    );
    if (result.modified) return;
  }

  throw new HttpError(
    429,
    "RATE_LIMITED",
    "มีการใช้งานถี่เกินไป กรุณารอสักครู่",
  );
}
