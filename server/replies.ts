export const REPLIES = {
  thank: {
    title: "ขอบคุณสำหรับการทำความสะอาด",
    message:
      "ยอดเยี่ยมเลยค่ะ ✅ ขอบคุณสำหรับการดูแลและรักษาความสะอาดพื้นที่นะคะ",
  },
  good: {
    title: "ทำได้ดีมาก",
    message: "ทำได้ดีมากค่ะ ⭐ ขอบคุณสำหรับความใส่ใจในการดูแลพื้นที่นะคะ",
  },
  ok: {
    title: "เรียบร้อยดี",
    message: "ตรวจสอบแล้วเรียบร้อยดีค่ะ 👍 ขอบคุณสำหรับความร่วมมือนะคะ",
  },
  more: {
    title: "กรุณาทำความสะอาดเพิ่มเติม",
    message:
      "รบกวนตรวจสอบและทำความสะอาดเพิ่มเติมในจุดที่ยังไม่เรียบร้อยนะคะ ⚠️",
  },
  redo: {
    title: "กรุณาดำเนินการอีกครั้ง",
    message:
      "รบกวนดำเนินการทำความสะอาดอีกครั้งให้เรียบร้อยนะคะ 🔄 ขอบคุณค่ะ",
  },
} as const;

export type ReplyAction = keyof typeof REPLIES;
export type DeliveryStatus = "SUCCESS" | "FAILED" | "UNKNOWN";

export function isReplyAction(value: unknown): value is ReplyAction {
  return typeof value === "string" && value in REPLIES;
}

export function getReply(action: ReplyAction) {
  return REPLIES[action];
}
