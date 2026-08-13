import { getReply, type DeliveryStatus, type ReplyAction } from "./replies";

export type GatewayResult = {
  status: DeliveryStatus;
  detail: string;
};

export function isGatewayConfigured() {
  const directWebhook = process.env.DINGTALK_WEBHOOK_URL?.trim() ?? "";
  return Boolean(directWebhook && isDingTalkWebhook(directWebhook));
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
  void requestId;
  return sendDirectToDingTalk(action);
}
