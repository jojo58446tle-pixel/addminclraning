import { getDataStore } from "./store";
import type { DeliveryStatus, ReplyAction } from "./replies";

export type HistoryItem = {
  id: string;
  createdAt: string;
  action: ReplyAction;
  title: string;
  message: string;
  status: DeliveryStatus;
  detail?: string;
};

const HISTORY_KEY = "history/latest";
const MAX_HISTORY = 30;

export async function readHistory() {
  const store = await getDataStore();
  const current = await store.getJson<{ items: HistoryItem[] }>(HISTORY_KEY);
  return current?.value.items ?? [];
}

export async function appendHistory(item: HistoryItem) {
  const store = await getDataStore();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await store.getJson<{ items: HistoryItem[] }>(HISTORY_KEY);
    const items = [item, ...(current?.value.items ?? [])]
      .filter(
        (entry, index, all) =>
          all.findIndex((candidate) => candidate.id === entry.id) === index,
      )
      .slice(0, MAX_HISTORY);

    const result = await store.setJson(
      HISTORY_KEY,
      { items },
      current
        ? { onlyIfMatch: current.etag }
        : { onlyIfNew: true },
    );
    if (result.modified) return true;
  }

  return false;
}
