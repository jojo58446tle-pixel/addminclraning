import type { DeliveryStatus, ReplyAction } from "./replies";

export type GatewayResult = {
  status: DeliveryStatus;
  detail: string;
};

export function isGatewayConfigured() {
  return Boolean(
    process.env.GAS_ENDPOINT_URL && process.env.GAS_SHARED_SECRET,
  );
}

export async function sendToGateway(
  action: ReplyAction,
  requestId: string,
): Promise<GatewayResult> {
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
