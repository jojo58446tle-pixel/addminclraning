import { getReply, type DeliveryStatus, type ReplyAction } from "./replies";

export type GatewayResult = {
  status: DeliveryStatus;
  detail: string;
};

export function isGatewayConfigured() {
  const directWebhook = process.env.DINGTALK_WEBHOOK_URL?.trim() ?? "";
  return Boolean(
    (directWebhook && isDingTalkWebhook(directWebhook)) ||
      (process.env.GAS_ENDPOINT_URL && process.env.GAS_SHARED_SECRET),
  );
}

function isDingTalkWebhook(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "oapi.dingtalk.com" ||
        url.hostname.endsWith(".dingtalk.com"))
    );
  } catch {
    return false;
  }
}

async function sendDirectToDingTalk(
  action: ReplyAction,
): Promise<GatewayResult> {
  const webhookUrl = process.env.DINGTALK_WEBHOOK_URL?.trim() ?? "";
  if (!isDingTalkWebhook(webhookUrl)) {
    return {
      status: "FAILED",
      detail: "DINGTALK_WEBHOOK_URL is missing or invalid",
    };
  }

  const reply = getReply(action);
  const mode = process.env.DINGTALK_WEBHOOK_MODE ?? "robot_markdown";
  const body =
    mode === "robot_text"
      ? {
          msgtype: "text",
          text: { content: `${reply.title}\n${reply.message}` },
          at: { isAtAll: false },
        }
      : {
          msgtype: "markdown",
          markdown: {
            title: reply.title,
            text: `### 🧹 Admin Cleaning\n\n**${reply.title}**\n\n${reply.message}`,
          },
          at: { isAtAll: false },
        };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    const payload = (() => {
      try {
        return JSON.parse(responseText) as {
          errcode?: number;
          errmsg?: string;
          message?: string;
          success?: boolean;
        };
      } catch {
        return null;
      }
    })();

    if (
      response.ok &&
      (Number(payload?.errcode) === 0 || payload?.success === true)
    ) {
      return { status: "SUCCESS", detail: "DingTalk confirmed success" };
    }

    if (!response.ok || (payload && Number(payload.errcode) !== 0)) {
      return {
        status: "FAILED",
        detail:
          payload?.errmsg ||
          payload?.message ||
          `DingTalk HTTP ${response.status}`,
      };
    }

    return {
      status: "UNKNOWN",
      detail: "DingTalk response did not confirm delivery",
    };
  } catch (error) {
    return {
      status: "UNKNOWN",
      detail:
        error instanceof Error ? error.message : "DingTalk request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendToGateway(
  action: ReplyAction,
  requestId: string,
): Promise<GatewayResult> {
  if (process.env.DINGTALK_WEBHOOK_URL) {
    return sendDirectToDingTalk(action);
  }

  const endpoint = process.env.GAS_ENDPOINT_URL;
  const gatewayToken = process.env.GAS_SHARED_SECRET;
  if (!endpoint || !gatewayToken) {
    return {
      status: "FAILED",
      detail: "Google Apps Script endpoint is not configured",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "admin-cleaning",
        action,
        requestId,
        issuedAt: new Date().toISOString(),
        gatewayToken,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      status?: DeliveryStatus;
      requestId?: string;
      sent?: boolean;
      message?: string;
    } | null;

    if (
      response.ok &&
      payload?.ok === true &&
      payload.status === "SUCCESS" &&
      payload.requestId === requestId
    ) {
      return { status: "SUCCESS", detail: "DingTalk confirmed success" };
    }

    if (
      payload?.status === "FAILED" &&
      payload.sent === false &&
      payload.requestId === requestId
    ) {
      return {
        status: "FAILED",
        detail: payload.message || "Gateway rejected before sending",
      };
    }

    return {
      status: "UNKNOWN",
      detail: "Gateway response did not confirm delivery",
    };
  } catch (error) {
    return {
      status: "UNKNOWN",
      detail:
        error instanceof Error ? error.message : "Gateway request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}
