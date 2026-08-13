import { sendToGateway } from "@/server/gateway";
import { appendHistory, type HistoryItem } from "@/server/history";
import {
  assertSameOrigin,
  errorResponse,
  getClientIp,
  HttpError,
  json,
  parseJsonObject,
} from "@/server/http";
import {
  finalizeRequest,
  reserveRequest,
} from "@/server/idempotency";
import { enforceRateLimit } from "@/server/rate-limit";
import { getReply, isReplyAction } from "@/server/replies";

export const dynamic = "force-dynamic";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,100}$/;

function duplicateResponse(
  status: "PROCESSING" | "SUCCESS" | "FAILED" | "UNKNOWN",
) {
  if (status === "SUCCESS") {
    return json({
      status: "SUCCESS",
      duplicate: true,
      message: "คำขอนี้ถูกส่งสำเร็จไปแล้ว ระบบไม่ได้ส่งซ้ำ",
    });
  }
  return json(
    {
      error: "DUPLICATE_REQUEST",
      status: status === "PROCESSING" ? "UNKNOWN" : status,
      message:
        "คำขอนี้เคยถูกประมวลผลแล้ว ระบบจะไม่ส่งซ้ำ กรุณาตรวจสอบในกลุ่ม DingTalk",
    },
    409,
  );
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseJsonObject(request);
    const action = body.action;
    const requestId =
      typeof body.requestId === "string" ? body.requestId : "";

    if (!isReplyAction(action)) {
      throw new HttpError(
        400,
        "ACTION_NOT_ALLOWED",
        "Action ไม่อยู่ในรายการที่อนุญาต",
      );
    }

    if (!REQUEST_ID_PATTERN.test(requestId)) {
      throw new HttpError(
        400,
        "INVALID_REQUEST_ID",
        "Client Request ID ไม่ถูกต้อง",
      );
    }

    await enforceRateLimit({
      bucket: "quick-reply",
      subject: getClientIp(request),
      limit: 5,
      windowSeconds: 60,
    });

    const reservation = await reserveRequest(requestId, action);
    if (!reservation.reserved) {
      return duplicateResponse(reservation.record.status);
    }

    const reply = getReply(action);
    const outcome = await sendToGateway(action, requestId);

    const historyItem: HistoryItem = {
      id: requestId,
      createdAt: new Date().toISOString(),
      action,
      title: reply.title,
      message: reply.message,
      status: outcome.status,
      detail: outcome.detail,
    };
    const persistence = await Promise.allSettled([
      finalizeRequest(
        reservation.record,
        reservation.etag,
        outcome.status,
        outcome.detail,
      ),
      appendHistory(historyItem),
    ]);
    const persistenceHealthy = persistence.every(
      (result) => result.status === "fulfilled" && result.value === true,
    );
    if (!persistenceHealthy) {
      console.error(
        "Post-delivery audit persistence was incomplete",
        persistence,
      );
    }

    if (outcome.status === "SUCCESS") {
      return json({
        status: "SUCCESS",
        message: "ส่งข้อความเรียบร้อยแล้ว",
        auditSaved: persistenceHealthy,
      });
    }

    if (outcome.status === "FAILED") {
      return json(
        {
          error: "DELIVERY_FAILED",
          status: "FAILED",
          message: "ส่งข้อความไม่สำเร็จ ระบบไม่ได้ส่งใหม่อัตโนมัติ",
        },
        502,
      );
    }

    return json(
      {
        error: "DELIVERY_UNKNOWN",
        status: "UNKNOWN",
        message:
          "ไม่สามารถยืนยันผลการส่งได้ ระบบจะไม่ส่งซ้ำอัตโนมัติ กรุณาตรวจสอบใน DingTalk",
      },
      504,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
