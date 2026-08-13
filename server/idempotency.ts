import { getDataStore } from "./store";
import type { DeliveryStatus, ReplyAction } from "./replies";

export type RequestRecord = {
  requestId: string;
  action: ReplyAction;
  status: "PROCESSING" | DeliveryStatus;
  createdAt: string;
  updatedAt: string;
  detail?: string;
};

export async function reserveRequest(
  requestId: string,
  action: ReplyAction,
) {
  const store = await getDataStore();
  const now = new Date().toISOString();
  const record: RequestRecord = {
    requestId,
    action,
    status: "PROCESSING",
    createdAt: now,
    updatedAt: now,
  };
  const created = await store.setJson("request/" + requestId, record, {
    onlyIfNew: true,
  });

  if (created.modified) {
    return {
      reserved: true as const,
      record,
      etag: created.etag!,
    };
  }

  const existing = await store.getJson<RequestRecord>(
    "request/" + requestId,
  );
  return {
    reserved: false as const,
    record: existing?.value ?? record,
    etag: existing?.etag,
  };
}

export async function finalizeRequest(
  record: RequestRecord,
  etag: string,
  status: DeliveryStatus,
  detail?: string,
) {
  const store = await getDataStore();
  const updated: RequestRecord = {
    ...record,
    status,
    updatedAt: new Date().toISOString(),
    detail,
  };
  const result = await store.setJson(
    "request/" + record.requestId,
    updated,
    { onlyIfMatch: etag },
  );
  return result.modified;
}
