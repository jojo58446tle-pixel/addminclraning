import assert from "node:assert/strict";
import test from "node:test";
import {
  finalizeRequest,
  reserveRequest,
} from "../server/idempotency";
import { isReplyAction, REPLIES } from "../server/replies";

process.env.LOCAL_STORAGE_MODE = "memory";
test("allows exactly the five predefined actions", () => {
  assert.deepEqual(Object.keys(REPLIES), [
    "thank",
    "good",
    "ok",
    "more",
    "redo",
  ]);
  assert.equal(isReplyAction("thank"), true);
  assert.equal(isReplyAction("custom-message"), false);
});

test("only one concurrent reservation can own a request ID", async () => {
  const requestId = "test-" + crypto.randomUUID();
  const results = await Promise.all([
    reserveRequest(requestId, "thank"),
    reserveRequest(requestId, "thank"),
    reserveRequest(requestId, "thank"),
  ]);
  assert.equal(results.filter((result) => result.reserved).length, 1);

  const owner = results.find((result) => result.reserved);
  assert.ok(owner?.reserved);
  assert.equal(
    await finalizeRequest(owner.record, owner.etag, "SUCCESS"),
    true,
  );

  const duplicate = await reserveRequest(requestId, "thank");
  assert.equal(duplicate.reserved, false);
  assert.equal(duplicate.record.status, "SUCCESS");
});
