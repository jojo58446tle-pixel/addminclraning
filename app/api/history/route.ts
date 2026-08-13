import { readHistory } from "@/server/history";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await readHistory();
  return json({ items: items.slice(0, 20) });
}
