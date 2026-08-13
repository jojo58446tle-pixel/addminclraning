"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ReplyAction = "thank" | "good" | "ok" | "more" | "redo";
type SendStatus = "SUCCESS" | "FAILED" | "UNKNOWN";

type Reply = {
  action: ReplyAction;
  icon: string;
  title: string;
  message: string;
  tone: string;
};

type HistoryItem = {
  id: string;
  createdAt: string;
  action: ReplyAction;
  title: string;
  message: string;
  status: SendStatus;
};

type SystemStatus = {
  connection: "CONFIGURED" | "NOT_CONFIGURED";
};

const REPLIES: Reply[] = [
  {
    action: "thank",
    icon: "✓",
    title: "ขอบคุณสำหรับการทำความสะอาด",
    message:
      "ยอดเยี่ยมเลยค่ะ ✅ ขอบคุณสำหรับการดูแลและรักษาความสะอาดพื้นที่นะคะ",
    tone: "green",
  },
  {
    action: "good",
    icon: "★",
    title: "ทำได้ดีมาก",
    message: "ทำได้ดีมากค่ะ ⭐ ขอบคุณสำหรับความใส่ใจในการดูแลพื้นที่นะคะ",
    tone: "yellow",
  },
  {
    action: "ok",
    icon: "👍",
    title: "เรียบร้อยดี",
    message: "ตรวจสอบแล้วเรียบร้อยดีค่ะ 👍 ขอบคุณสำหรับความร่วมมือนะคะ",
    tone: "blue",
  },
  {
    action: "more",
    icon: "!",
    title: "กรุณาทำความสะอาดเพิ่มเติม",
    message:
      "รบกวนตรวจสอบและทำความสะอาดเพิ่มเติมในจุดที่ยังไม่เรียบร้อยนะคะ ⚠️",
    tone: "red",
  },
  {
    action: "redo",
    icon: "↻",
    title: "กรุณาดำเนินการอีกครั้ง",
    message: "รบกวนดำเนินการทำความสะอาดอีกครั้งให้เรียบร้อยนะคะ 🔄 ขอบคุณค่ะ",
    tone: "purple",
  },
];

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "req-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({
    error: "INVALID_RESPONSE",
    message: "ระบบตอบกลับไม่ถูกต้อง",
  }));

  if (!response.ok) {
    const error = new Error(
      typeof payload.message === "string"
        ? payload.message
        : "ไม่สามารถดำเนินการได้",
    ) as Error & { status?: number; code?: string; payload?: unknown };
    error.status = response.status;
    error.code = payload.error;
    error.payload = payload;
    throw error;
  }

  return payload as T;
}

function formatHistoryDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function Home() {
  const [tab, setTab] = useState<"send" | "settings">("send");
  const [connection, setConnection] =
    useState<SystemStatus["connection"]>("NOT_CONFIGURED");
  const [selected, setSelected] = useState<Reply | null>(null);
  const [requestId, setRequestId] = useState("");
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const result = await api<{ items: HistoryItem[] }>("/api/history");
      setHistory(result.items);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api<SystemStatus>("/api/status"),
      api<{ items: HistoryItem[] }>("/api/history"),
    ]).then(([statusResult, historyResult]) => {
      if (!active) return;
      if (statusResult.status === "fulfilled") {
        setConnection(statusResult.value.connection);
      }
      if (historyResult.status === "fulfilled") {
        setHistory(historyResult.value.items);
      }
      setHistoryLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && selected && !sending) {
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, sending]);

  function openConfirmation(reply: Reply) {
    if (sending) return;
    setNotice(null);
    setRequestId(createRequestId());
    setSelected(reply);
  }

  function closeConfirmation() {
    if (sending) return;
    setSelected(null);
    setRequestId("");
  }

  async function confirmSend() {
    if (!selected || sending || inFlight.current || !requestId) return;

    inFlight.current = true;
    setSending(true);
    setNotice(null);

    try {
      const result = await api<{ status: SendStatus; message: string }>(
        "/api/quick-reply",
        {
          method: "POST",
          body: JSON.stringify({
            action: selected.action,
            requestId,
          }),
        },
      );
      if (result.status === "SUCCESS") {
        setNotice({
          type: "success",
          text: "ส่งข้อความเรียบร้อยแล้ว",
        });
      }
      setSelected(null);
      setRequestId("");
      await loadHistory();
    } catch (error) {
      const err = error as Error & {
        status?: number;
        code?: string;
        payload?: { status?: SendStatus };
      };
      const uncertain =
        err.code === "DELIVERY_UNKNOWN" ||
        err.payload?.status === "UNKNOWN";
      setNotice({
        type: uncertain ? "warning" : "error",
        text: uncertain
          ? "ไม่สามารถยืนยันผลการส่งได้ ห้ามกดส่งซ้ำ กรุณาตรวจสอบในกลุ่ม DingTalk"
          : err.message || "ส่งข้อความไม่สำเร็จ",
      });
      setSelected(null);
      setRequestId("");
      await loadHistory();
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-brand">
          <div className="hero-icon" aria-hidden="true">
            🧹
          </div>
          <div>
            <h1>Admin Cleaning</h1>
            <p>ตอบกลับทีมทำความสะอาด</p>
          </div>
        </div>
        <div className="ready-badge">
          <span aria-hidden="true" />
          พร้อมใช้งาน
        </div>
      </header>

      <section className="content-panel">
        {tab === "send" ? (
          <>
            <div className="section-heading">
              <div className="heading-icon" aria-hidden="true">
                💬
              </div>
              <div>
                <h2>เลือกข้อความที่ต้องการส่ง</h2>
                <p>กดปุ่มเพื่อเลือกข้อความตอบกลับ</p>
              </div>
            </div>

            {notice ? (
              <div className={"notice " + notice.type} role="status">
                <span aria-hidden="true">
                  {notice.type === "success"
                    ? "✓"
                    : notice.type === "warning"
                      ? "!"
                      : "×"}
                </span>
                <p>{notice.text}</p>
                <button
                  type="button"
                  aria-label="ปิดข้อความแจ้งเตือน"
                  onClick={() => setNotice(null)}
                >
                  ×
                </button>
              </div>
            ) : null}

            <div className="reply-list" aria-label="ข้อความตอบกลับด่วน">
              {REPLIES.map((reply) => (
                <button
                  type="button"
                  className={"reply-card " + reply.tone}
                  key={reply.action}
                  onClick={() => openConfirmation(reply)}
                  disabled={sending}
                >
                  <span className="reply-icon" aria-hidden="true">
                    {reply.icon}
                  </span>
                  <span className="reply-copy">
                    <strong>{reply.title}</strong>
                    <span>{reply.message}</span>
                  </span>
                  <span className="reply-arrow" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>

            <section className="history-card" aria-labelledby="history-title">
              <div className="history-header">
                <div>
                  <p className="history-kicker">AUDIT LOG</p>
                  <h2 id="history-title">ประวัติการส่งล่าสุด</h2>
                </div>
                <button
                  type="button"
                  className="refresh-button"
                  onClick={() => void loadHistory()}
                  disabled={historyLoading}
                >
                  {historyLoading ? "กำลังโหลด..." : "รีเฟรช"}
                </button>
              </div>

              {historyLoading && history.length === 0 ? (
                <p className="empty-history">กำลังโหลดประวัติ...</p>
              ) : history.length === 0 ? (
                <p className="empty-history">ยังไม่มีประวัติการส่งข้อความ</p>
              ) : (
                <ul className="history-list">
                  {history.slice(0, 10).map((item) => (
                    <li key={item.id}>
                      <div className="history-topline">
                        <time dateTime={item.createdAt}>
                          {formatHistoryDate(item.createdAt)}
                        </time>
                        <span
                          className={"status-pill " + item.status.toLowerCase()}
                        >
                          {item.status}
                        </span>
                      </div>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <section className="settings-page" aria-labelledby="settings-title">
            <div className="section-heading compact">
              <div className="heading-icon" aria-hidden="true">
                ⚙️
              </div>
              <div>
                <h2 id="settings-title">ตั้งค่า</h2>
                <p>ข้อมูลการเชื่อมต่อของระบบ</p>
              </div>
            </div>

            <div className="settings-card">
              <div className="setting-row">
                <span className="setting-icon" aria-hidden="true">
                  👤
                </span>
                <div>
                  <p>Admin Access</p>
                  <strong>เปิดใช้งานโดยตรง ไม่ต้องใส่รหัส</strong>
                </div>
              </div>
              <div className="setting-row">
                <span className="setting-icon" aria-hidden="true">
                  🔗
                </span>
                <div>
                  <p>DingTalk Connection</p>
                  <strong
                    className={
                      connection === "CONFIGURED"
                        ? "connection-ok"
                        : "connection-missing"
                    }
                  >
                    {connection === "CONFIGURED"
                      ? "พร้อมเชื่อมต่อ"
                      : "ยังไม่ได้ตั้งค่า Endpoint"}
                  </strong>
                </div>
              </div>
            </div>

            <p className="settings-note">
              ระบบจะส่งข้อความเมื่อ Admin เลือก ตรวจสอบ และกดยืนยันเท่านั้น
            </p>
          </section>
        )}
      </section>

      <nav className="bottom-nav" aria-label="เมนูหลัก">
        <button
          type="button"
          className={tab === "send" ? "active" : ""}
          onClick={() => setTab("send")}
        >
          <span aria-hidden="true">💬</span>
          ส่งข้อความ
        </button>
        <button
          type="button"
          className={tab === "settings" ? "active" : ""}
          onClick={() => setTab("settings")}
        >
          <span aria-hidden="true">⚙️</span>
          ตั้งค่า
        </button>
      </nav>

      {selected ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeConfirmation();
          }}
        >
          <section
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
          >
            <div className={"modal-icon " + selected.tone} aria-hidden="true">
              {selected.icon}
            </div>
            <p className="modal-eyebrow">ตรวจสอบก่อนส่งเข้ากลุ่มจริง</p>
            <h2 id="confirm-title">ยืนยันการส่งข้อความ</h2>
            <div className="preview-box">
              <p>ข้อความที่จะส่ง</p>
              <blockquote id="confirm-message">“{selected.message}”</blockquote>
            </div>
            <p className="modal-warning">
              ระบบจะไม่ส่งข้อความจนกว่าคุณจะกด “ยืนยันการส่ง”
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={closeConfirmation}
                disabled={sending}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="confirm-button"
                onClick={() => void confirmSend()}
                disabled={sending}
              >
                {sending ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    กำลังส่งข้อความ...
                  </>
                ) : (
                  "ยืนยันการส่ง"
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
