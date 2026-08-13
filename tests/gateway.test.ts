import assert from "node:assert/strict";
import test from "node:test";

import { sendToGateway } from "../server/gateway";

const originalFetch = globalThis.fetch;
const originalWebhook = process.env.DINGTALK_WEBHOOK_URL;
const originalMode = process.env.DINGTALK_WEBHOOK_MODE;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWebhook === undefined) delete process.env.DINGTALK_WEBHOOK_URL;
  else process.env.DINGTALK_WEBHOOK_URL = originalWebhook;
  if (originalMode === undefined) delete process.env.DINGTALK_WEBHOOK_MODE;
  else process.env.DINGTALK_WEBHOOK_MODE = originalMode;
});

test("Netlify backend sends a robot markdown message directly", async () => {
  process.env.DINGTALK_WEBHOOK_URL =
    "https://oapi.dingtalk.com/robot/send?access_token=test";
  process.env.DINGTALK_WEBHOOK_MODE = "robot_markdown";
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return Response.json({ errcode: 0, errmsg: "ok" });
  };

  const result = await sendToGateway("ok", "request-1234");
  const body = JSON.parse(requestBody);

  assert.equal(result.status, "SUCCESS");
  assert.equal(body.msgtype, "markdown");
  assert.equal(body.markdown.title, "เรียบร้อยดี");
  assert.match(body.markdown.text, /Admin Cleaning/);
});

test("DingTalk rejection is returned as FAILED with its reason", async () => {
  process.env.DINGTALK_WEBHOOK_URL =
    "https://oapi.dingtalk.com/robot/send?access_token=test";
  globalThis.fetch = async () =>
    Response.json({ errcode: 310000, errmsg: "keywords not in content" });

  const result = await sendToGateway("ok", "request-1234");

  assert.equal(result.status, "FAILED");
  assert.match(result.detail, /keywords not in content/);
});
