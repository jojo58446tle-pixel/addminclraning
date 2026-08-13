import { isGatewayConfigured } from "@/server/gateway";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

export function GET() {
  return json({
    connection: isGatewayConfigured() ? "CONFIGURED" : "NOT_CONFIGURED",
  });
}
