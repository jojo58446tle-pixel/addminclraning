/**
 * Admin Cleaning Quick Reply endpoint.
 *
 * This file is an ADD-ON to the existing cleaning scheduler.
 * It does not change Daily Cleaning, Weekly Cleaning, Smoking Weekly,
 * Smoking Monthly, or any time trigger.
 *
 * This version can send to DingTalk by itself. It no longer requires an
 * existing sendDingTalk() function.
 *
 * Script properties:
 *   ADMIN_CLEANING_SHARED_SECRET         required
 *   ADMIN_CLEANING_DINGTALK_WEBHOOK_URL  required for direct delivery
 *   ADMIN_CLEANING_DINGTALK_MODE         optional; workflow_text (default),
 *                                         robot_text, or robot_markdown
 */

const ADMIN_CLEANING_ACTIONS = Object.freeze({
  thank: Object.freeze({
    title: "ขอบคุณสำหรับการทำความสะอาด",
    message:
      "ยอดเยี่ยมเลยค่ะ ✅ ขอบคุณสำหรับการดูแลและรักษาความสะอาดพื้นที่นะคะ",
  }),
  good: Object.freeze({
    title: "ทำได้ดีมาก",
    message: "ทำได้ดีมากค่ะ ⭐ ขอบคุณสำหรับความใส่ใจในการดูแลพื้นที่นะคะ",
  }),
  ok: Object.freeze({
    title: "เรียบร้อยดี",
    message: "ตรวจสอบแล้วเรียบร้อยดีค่ะ 👍 ขอบคุณสำหรับความร่วมมือนะคะ",
  }),
  more: Object.freeze({
    title: "กรุณาทำความสะอาดเพิ่มเติม",
    message:
      "รบกวนตรวจสอบและทำความสะอาดเพิ่มเติมในจุดที่ยังไม่เรียบร้อยนะคะ ⚠️",
  }),
  redo: Object.freeze({
    title: "กรุณาดำเนินการอีกครั้ง",
    message:
      "รบกวนดำเนินการทำความสะอาดอีกครั้งให้เรียบร้อยนะคะ 🔄 ขอบคุณค่ะ",
  }),
});

/**
 * If the Apps Script project already has doPost(e), do not create a second
 * doPost. Route payload.source === "admin-cleaning" from the existing doPost
 * to handleAdminCleaningQuickReply(e).
 */
function doPost(e) {
  return handleAdminCleaningQuickReply(e);
}

function doGet() {
  const properties = PropertiesService.getScriptProperties();
  return adminCleaningJson_({
    ok: true,
    system: "Admin Cleaning DingTalk Gateway",
    webhookConfigured: Boolean(adminCleaningGetWebhookUrl_(properties)),
    sharedSecretConfigured: Boolean(
      properties.getProperty("ADMIN_CLEANING_SHARED_SECRET"),
    ),
  });
}

function handleAdminCleaningQuickReply(e) {
  let payload = {};
  try {
    payload = JSON.parse((e.postData && e.postData.contents) || "{}");
  } catch (error) {
    return adminCleaningJson_({
      ok: false,
      status: "FAILED",
      sent: false,
      requestId: "",
      message: "Invalid JSON",
    });
  }

  const requestId =
    typeof payload.requestId === "string" ? payload.requestId : "";
  const action = typeof payload.action === "string" ? payload.action : "";
  const expectedSecret =
    PropertiesService.getScriptProperties().getProperty(
      "ADMIN_CLEANING_SHARED_SECRET",
    ) || "";

  if (
    !expectedSecret ||
    !adminCleaningSafeEquals_(String(payload.gatewayToken || ""), expectedSecret)
  ) {
    return adminCleaningJson_({
      ok: false,
      status: "FAILED",
      sent: false,
      requestId: requestId,
      message: "Unauthorized gateway",
    });
  }

  if (payload.source !== "admin-cleaning") {
    return adminCleaningJson_({
      ok: false,
      status: "FAILED",
      sent: false,
      requestId: requestId,
      message: "Invalid source",
    });
  }

  const issuedAt = Date.parse(String(payload.issuedAt || ""));
  if (
    !Number.isFinite(issuedAt) ||
    Math.abs(Date.now() - issuedAt) > 5 * 60 * 1000
  ) {
    return adminCleaningJson_({
      ok: false,
      status: "FAILED",
      sent: false,
      requestId: requestId,
      message: "Request timestamp is invalid or expired",
    });
  }

  if (!/^[A-Za-z0-9-]{8,100}$/.test(requestId)) {
    return adminCleaningJson_({
      ok: false,
      status: "FAILED",
      sent: false,
      requestId: requestId,
      message: "Invalid request ID",
    });
  }

  if (!Object.prototype.hasOwnProperty.call(ADMIN_CLEANING_ACTIONS, action)) {
    return adminCleaningJson_({
      ok: false,
      status: "FAILED",
      sent: false,
      requestId: requestId,
      message: "Action is not allowed",
    });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return adminCleaningJson_({
      ok: false,
      status: "UNKNOWN",
      sent: null,
      requestId: requestId,
      message: "Endpoint is busy. Delivery was not attempted automatically.",
    });
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    const propertyKey = "ADMIN_CLEANING_REQUEST_" + requestId;
    const existingRaw = properties.getProperty(propertyKey);

    if (existingRaw) {
      const existing = JSON.parse(existingRaw);
      if (existing.status === "SUCCESS") {
        return adminCleaningJson_({
          ok: true,
          status: "SUCCESS",
          sent: true,
          duplicate: true,
          requestId: requestId,
          message: "Already sent. Duplicate request was not sent again.",
        });
      }
      return adminCleaningJson_({
        ok: false,
        status: existing.status === "FAILED" ? "FAILED" : "UNKNOWN",
        sent: existing.status === "FAILED" ? false : null,
        duplicate: true,
        requestId: requestId,
        message: "Request already processed. It was not sent again.",
      });
    }

    properties.setProperty(
      propertyKey,
      JSON.stringify({
        status: "PROCESSING",
        action: action,
        updatedAt: new Date().toISOString(),
      }),
    );

    const reply = ADMIN_CLEANING_ACTIONS[action];
    const markdown =
      "### 🧹 Admin Cleaning\n\n**" +
      reply.title +
      "**\n\n" +
      reply.message;

    let dingTalkResult;
    try {
      dingTalkResult = adminCleaningSendDingTalk_(
        reply.title,
        reply.message,
        markdown,
      );
    } catch (error) {
      properties.setProperty(
        propertyKey,
        JSON.stringify({
          status: "UNKNOWN",
          action: action,
          updatedAt: new Date().toISOString(),
          detail: String(error),
        }),
      );
      return adminCleaningJson_({
        ok: false,
        status: "UNKNOWN",
        sent: null,
        requestId: requestId,
        message: String(error).slice(0, 300),
      });
    }

    const confirmation = adminCleaningConfirmDingTalk_(dingTalkResult);
    properties.setProperty(
      propertyKey,
      JSON.stringify({
        status: confirmation.status,
        action: action,
        updatedAt: new Date().toISOString(),
        detail: confirmation.message,
      }),
    );
    adminCleaningPruneRequestProperties_(properties);

    return adminCleaningJson_({
      ok: confirmation.status === "SUCCESS",
      status: confirmation.status,
      sent: confirmation.sent,
      requestId: requestId,
      message: confirmation.message,
    });
  } finally {
    lock.releaseLock();
  }
}

function adminCleaningGetWebhookUrl_(properties) {
  return (
    properties.getProperty("ADMIN_CLEANING_DINGTALK_WEBHOOK_URL") ||
    properties.getProperty("DINGTALK_WEBHOOK_URL") ||
    ""
  ).trim();
}

function adminCleaningSendDingTalk_(title, message, markdown) {
  const properties = PropertiesService.getScriptProperties();
  const webhookUrl = adminCleaningGetWebhookUrl_(properties);

  // Prefer the dedicated webhook because it gives this endpoint a real
  // HTTP response that can be verified as SUCCESS or FAILED.
  if (webhookUrl) {
    if (!/^https:\/\//i.test(webhookUrl)) {
      throw new Error("DingTalk webhook URL must use HTTPS");
    }

    const mode = String(
      properties.getProperty("ADMIN_CLEANING_DINGTALK_MODE") ||
        "workflow_text",
    ).toLowerCase();
    let contentType = "text/plain; charset=utf-8";
    let payload = markdown;

    if (mode === "robot_text") {
      contentType = "application/json; charset=utf-8";
      payload = JSON.stringify({
        msgtype: "text",
        text: { content: title + "\n" + message },
        at: { isAtAll: false },
      });
    } else if (mode === "robot_markdown") {
      contentType = "application/json; charset=utf-8";
      payload = JSON.stringify({
        msgtype: "markdown",
        markdown: { title: title, text: markdown },
        at: { isAtAll: false },
      });
    } else if (mode !== "workflow_text") {
      throw new Error("Unsupported DingTalk mode: " + mode);
    }

    return UrlFetchApp.fetch(webhookUrl, {
      method: "post",
      contentType: contentType,
      payload: payload,
      followRedirects: true,
      muteHttpExceptions: true,
    });
  }

  // Backward compatibility for an older scheduler project. The older
  // function must return UrlFetchApp.fetch(...). If it does not, the result
  // remains UNKNOWN so the system never lies about delivery.
  if (typeof sendDingTalk === "function") {
    return sendDingTalk(title, message, markdown);
  }

  throw new Error(
    "Missing ADMIN_CLEANING_DINGTALK_WEBHOOK_URL Script Property",
  );
}

function adminCleaningPruneRequestProperties_(properties) {
  const prefix = "ADMIN_CLEANING_REQUEST_";
  const all = properties.getProperties();
  const records = Object.keys(all)
    .filter(function (key) {
      return key.indexOf(prefix) === 0;
    })
    .map(function (key) {
      let updatedAt = 0;
      try {
        updatedAt = Date.parse(JSON.parse(all[key]).updatedAt || "") || 0;
      } catch (error) {
        updatedAt = 0;
      }
      return { key: key, updatedAt: updatedAt };
    })
    .sort(function (left, right) {
      return right.updatedAt - left.updatedAt;
    });

  records.slice(300).forEach(function (record) {
    properties.deleteProperty(record.key);
  });
}

function adminCleaningConfirmDingTalk_(result) {
  if (!result) {
    return {
      status: "UNKNOWN",
      sent: null,
      message:
        "sendDingTalk did not return a response. Add return response to the existing function.",
    };
  }

  try {
    if (
      typeof result.getResponseCode === "function" &&
      typeof result.getContentText === "function"
    ) {
      const responseCode = result.getResponseCode();
      const responseText = String(result.getContentText() || "").trim();
      let content = null;
      if (responseText) {
        try {
          content = JSON.parse(responseText);
        } catch (error) {
          content = null;
        }
      }

      if (responseCode < 200 || responseCode >= 300) {
        return {
          status: "FAILED",
          sent: false,
          message:
            "DingTalk HTTP " +
            responseCode +
            (responseText ? ": " + responseText.slice(0, 300) : ""),
        };
      }

      if (content && Object.prototype.hasOwnProperty.call(content, "errcode")) {
        if (Number(content.errcode) === 0) {
          return {
            status: "SUCCESS",
            sent: true,
            message: "DingTalk confirmed success",
          };
        }
        return {
          status: "FAILED",
          sent: false,
          message:
            "DingTalk rejected the message: " +
            String(content.errmsg || content.message || content.errcode),
        };
      }

      if (content && content.success === false) {
        return {
          status: "FAILED",
          sent: false,
          message:
            "DingTalk rejected the message: " +
            String(content.message || content.error || "success=false"),
        };
      }

      if (content && Object.prototype.hasOwnProperty.call(content, "code")) {
        const code = Number(content.code);
        if (Number.isFinite(code) && code !== 0 && code !== 200) {
          return {
            status: "FAILED",
            sent: false,
            message:
              "DingTalk rejected the message: " +
              String(content.message || content.code),
          };
        }
      }

      // DingTalk Workflow webhooks commonly return HTTP 2xx without the
      // custom-robot errcode field. A successful HTTP response means the
      // workflow accepted the trigger.
      if (responseCode >= 200 && responseCode < 300) {
        return {
          status: "SUCCESS",
          sent: true,
          message: "DingTalk webhook accepted the message",
        };
      }
    }

    if (typeof result === "object" && Number(result.errcode) === 0) {
      return {
        status: "SUCCESS",
        sent: true,
        message: "DingTalk confirmed success",
      };
    }
  } catch (error) {
    return {
      status: "UNKNOWN",
      sent: null,
      message: "Could not parse DingTalk response",
    };
  }

  return {
    status: "UNKNOWN",
    sent: null,
    message: "DingTalk response format is unknown",
  };
}

function adminCleaningSafeEquals_(left, right) {
  const a = String(left);
  const b = String(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |=
      (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function adminCleaningJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
