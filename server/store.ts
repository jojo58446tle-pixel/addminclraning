type StoredValue<T> = {
  value: T;
  etag: string;
};

type SetOptions = {
  onlyIfNew?: boolean;
  onlyIfMatch?: string;
};

type SetResult = {
  modified: boolean;
  etag?: string;
};

export interface DataStore {
  getJson<T>(key: string): Promise<StoredValue<T> | null>;
  setJson<T>(
    key: string,
    value: T,
    options?: SetOptions,
  ): Promise<SetResult>;
}

type MemoryEntry = {
  value: unknown;
  etag: string;
};

declare global {
  var __adminCleaningMemoryStore: Map<string, MemoryEntry> | undefined;
}

function memoryStore(): DataStore {
  const entries =
    globalThis.__adminCleaningMemoryStore ??
    (globalThis.__adminCleaningMemoryStore = new Map<string, MemoryEntry>());

  return {
    async getJson<T>(key: string) {
      const entry = entries.get(key);
      if (!entry) return null;
      return {
        value: structuredClone(entry.value) as T,
        etag: entry.etag,
      };
    },
    async setJson<T>(key: string, value: T, options: SetOptions = {}) {
      const current = entries.get(key);
      if (options.onlyIfNew && current) return { modified: false };
      if (options.onlyIfMatch && current?.etag !== options.onlyIfMatch) {
        return { modified: false };
      }
      if (options.onlyIfMatch && !current) return { modified: false };
      const etag = '"' + crypto.randomUUID() + '"';
      entries.set(key, { value: structuredClone(value), etag });
      return { modified: true, etag };
    },
  };
}

async function netlifyStore(): Promise<DataStore> {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({
    name: "admin-cleaning",
    consistency: "strong",
  });

  return {
    async getJson<T>(key: string) {
      const entry = await store.getWithMetadata(key, { type: "json" });
      if (!entry) return null;
      if (!entry.etag) {
        throw new Error("Netlify Blobs response is missing an ETag");
      }
      return {
        value: entry.data as T,
        etag: entry.etag,
      };
    },
    async setJson<T>(key: string, value: T, options: SetOptions = {}) {
      if (options.onlyIfNew) {
        return store.setJSON(key, value, { onlyIfNew: true });
      }
      if (options.onlyIfMatch) {
        return store.setJSON(key, value, {
          onlyIfMatch: options.onlyIfMatch,
        });
      }
      return store.setJSON(key, value);
    },
  };
}

export async function getDataStore() {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.LOCAL_STORAGE_MODE === "memory"
  ) {
    return memoryStore();
  }
  return netlifyStore();
}
