export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(
  data: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      ...extraHeaders,
    },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return json(
      {
        error: error.code,
        message: error.message,
      },
      error.status,
    );
  }

  console.error("Unhandled API error", error);
  return json(
    {
      error: "INTERNAL_ERROR",
      message: "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง",
    },
    500,
  );
}

export async function parseJsonObject(
  request: Request,
  maxBytes = 2_048,
): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "รองรับเฉพาะ JSON");
  }

  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maxBytes) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "ข้อมูลมีขนาดใหญ่เกินกำหนด");
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "รูปแบบข้อมูลไม่ถูกต้อง");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_BODY", "รูปแบบข้อมูลไม่ถูกต้อง");
  }

  return value as Record<string, unknown>;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = process.env.PUBLIC_APP_ORIGIN?.replace(/\/$/, "");
  const expected = configured || new URL(request.url).origin;

  if (!origin || origin !== expected) {
    throw new HttpError(403, "ORIGIN_REJECTED", "คำขอไม่ได้มาจากระบบนี้");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    throw new HttpError(403, "ORIGIN_REJECTED", "คำขอไม่ได้มาจากระบบนี้");
  }
}

export function getClientIp(request: Request) {
  const netlifyIp = request.headers.get("x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return "unknown";
}
