import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../google-apps-script/AdminCleaningQuickReply.gs", import.meta.url),
  "utf8",
);

function loadAppsScript(
  properties: Record<string, string>,
  response: { code: number; body: string } = { code: 200, body: "" },
) {
  let request:
    | { url: string; options: Record<string, unknown> }
    | undefined;
  const propertyStore = {
    getProperty(key: string) {
      return properties[key] ?? null;
    },
    getProperties() {
      return { ...properties };
    },
    setProperty() {},
    deleteProperty() {},
  };
  const context = vm.createContext({
    Boolean,
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    PropertiesService: {
      getScriptProperties: () => propertyStore,
    },
    String,
    UrlFetchApp: {
      fetch(url: string, options: Record<string, unknown>) {
        request = { url, options };
        return {
          getResponseCode: () => response.code,
          getContentText: () => response.body,
        };
      },
    },
  });
  vm.runInContext(source, context);
  return { context, getRequest: () => request };
}

test("workflow_text sends a plain-text DingTalk webhook request", () => {
  const { context, getRequest } = loadAppsScript({
    ADMIN_CLEANING_DINGTALK_WEBHOOK_URL:
      "https://api.dingtalk.com/example-webhook",
    ADMIN_CLEANING_DINGTALK_MODE: "workflow_text",
  });

  const result = context.adminCleaningSendDingTalk_(
    "เรียบร้อยดี",
    "ขอบคุณค่ะ",
    "### Admin Cleaning\n\nเรียบร้อยดี",
  );

  assert.equal(result.getResponseCode(), 200);
  const request = getRequest();
  assert.equal(request?.url, "https://api.dingtalk.com/example-webhook");
  assert.equal(request?.options.method, "post");
  assert.equal(request?.options.contentType, "text/plain; charset=utf-8");
  assert.equal(
    request?.options.payload,
    "### Admin Cleaning\n\nเรียบร้อยดี",
  );
  assert.equal(request?.options.followRedirects, true);
  assert.equal(request?.options.muteHttpExceptions, true);
});

test("a 2xx DingTalk Workflow response is confirmed as SUCCESS", () => {
  const { context } = loadAppsScript({});
  const result = context.adminCleaningConfirmDingTalk_({
    getResponseCode: () => 200,
    getContentText: () => "",
  });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.sent, true);
});

test("a DingTalk robot error is confirmed as FAILED", () => {
  const { context } = loadAppsScript({});
  const result = context.adminCleaningConfirmDingTalk_({
    getResponseCode: () => 200,
    getContentText: () =>
      JSON.stringify({ errcode: 310000, errmsg: "keywords not in content" }),
  });

  assert.equal(result.status, "FAILED");
  assert.equal(result.sent, false);
  assert.match(result.message, /keywords not in content/);
});
