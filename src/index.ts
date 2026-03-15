import axios, { AxiosHeaders } from "axios";
import { runtime } from "../type/runtime-api";

const API_BASE = "https://picaapi.picacomic.com/";
const API_KEY = "C69BAF41DA5ABD1FFEDC6D2FEA56B";
const SECRET_KEY =
  "~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn";
const CACHE_TTL_MS = 10 * 60 * 1000;

type BikaRequestPayload = {
  url: string;
  method?: string;
  body?: unknown;
  cache?: boolean;
  imageQuality?: string;
  authorization?: string;
  settings?: {
    proxy?: string;
    imageQuality?: string;
    authorization?: string;
  };
};

type CacheEntry = {
  expireAt: number;
  data: unknown;
};

const CACHE_KEY_PREFIX = "bikaComic:requestCache:";

function toCacheStorageKey(cacheKey: string): string {
  return `${CACHE_KEY_PREFIX}${cacheKey}`;
}

function readCache(cacheKey: string): unknown | undefined {
  const key = toCacheStorageKey(cacheKey);
  const entry = runtime.cache.get<CacheEntry | undefined>(key) as
    | CacheEntry
    | undefined;
  if (!entry) return undefined;

  if (entry.expireAt <= Date.now()) {
    runtime.cache.delete(key);
    return undefined;
  }

  return deepClone(entry.data);
}

function writeCache(cacheKey: string, data: unknown): void {
  runtime.cache.set(toCacheStorageKey(cacheKey), {
    expireAt: Date.now() + CACHE_TTL_MS,
    data: deepClone(data),
  } satisfies CacheEntry);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function randomHex(len: number): string {
  let out = "";
  while (out.length < len) {
    out += runtime.uuidv4().split("-").join("");
  }
  return out.slice(0, len);
}

function toUpperMethod(method: unknown): string {
  const value = String(method || "GET").trim();
  return (value || "GET").toUpperCase();
}

function cleanPath(input: string): string {
  return String(input || "")
    .replace(API_BASE, "")
    .replace(/^\/+/, "");
}

function normalizeForKey(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) || "";
  } catch {
    return String(value);
  }
}

function normalizeRequestUrlForKey(url: unknown): string {
  const value = String(url || "").trim();
  if (!value) return "";
  return cleanPath(value);
}

function buildCacheKey(payload: BikaRequestPayload, method: string): string {
  const authForKey = payload.authorization ?? payload.settings?.authorization;
  const qualityForKey = payload.imageQuality ?? payload.settings?.imageQuality;
  const normalizedUrl = normalizeRequestUrlForKey(payload.url);
  const rawKey = `${method}|${normalizedUrl}|${normalizeForKey(payload.body)}|${String(authForKey || "")}|${String(qualityForKey || "")}`;
  const digest = runtime.crypto
    .createHash("sha256")
    .update(rawKey)
    .digest("hex") as string;
  return `v1:${digest}`;
}

function deepClone<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }
  return JSON.parse(JSON.stringify(input)) as T;
}

function createSignature(
  path: string,
  timestamp: number,
  nonce: string,
  method: string,
): string {
  const raw = `${path}${timestamp}${nonce}${method}${API_KEY}`.toLowerCase();
  return runtime.crypto
    .createHmac("sha256", SECRET_KEY)
    .update(raw)
    .digest("hex") as string;
}

function mapNetworkError(err: unknown): string {
  const e = err as {
    code?: string;
    message?: string;
    response?: {
      data?: { code?: number; message?: string; errorMsg?: string };
    };
  };

  const data = e?.response?.data;
  const message = String(data?.message || data?.errorMsg || "");

  if (data?.code === 401 && message === "unauthorized") {
    return "__NEED_LOGIN__:unauthorized";
  }
  if (message === "under review") {
    return "审核中";
  }
  if (message) {
    return message;
  }
  if (e?.code === "ECONNABORTED") {
    return "连接服务器超时";
  }
  return String(e?.message || err || "未知网络错误");
}

const client = axios.create({
  baseURL: API_BASE,
  timeout: 10_000,
  adapter: "fetch",
});

client.interceptors.request.use((config) => {
  const payload = ((config as unknown as { __bikaPayload?: BikaRequestPayload })
    .__bikaPayload ?? {}) as Partial<BikaRequestPayload>;
  const method = toUpperMethod(config.method);
  const requestUrl = String(config.url || "");
  const nonce = randomHex(32);
  const timestamp = nowSeconds();
  const path = cleanPath(requestUrl);

  const imageQuality =
    payload.imageQuality || payload.settings?.imageQuality || "original";
  const authorization =
    payload.authorization ?? payload.settings?.authorization ?? "";
  const appChannel = String(payload.settings?.proxy || "1");
  const headers = AxiosHeaders.from(config.headers);

  headers.set("api-key", API_KEY);
  headers.set("accept", "application/vnd.picacomic.com.v1+json");
  headers.set("app-channel", appChannel);
  headers.set("time", String(timestamp));
  headers.set("nonce", nonce);
  headers.set("signature", createSignature(path, timestamp, nonce, method));
  headers.set("app-version", "2.2.1.3.3.4");
  headers.set("app-uuid", "defaultUuid");
  headers.set("app-platform", "android");
  headers.set("app-build-version", "45");
  headers.set("accept-encoding", "gzip");
  headers.set("user-agent", "okhttp/3.8.1");
  headers.set("content-type", "application/json; charset=UTF-8");
  headers.set("image-quality", imageQuality);

  if (authorization) {
    headers.set("authorization", authorization);
  }

  config.method = method;
  config.headers = headers;
  return config;
});

client.interceptors.response.use(
  (response) => {
    const cfg = response.config as {
      __cacheKey?: string;
      __useCache?: boolean;
    };
    if (cfg.__useCache && cfg.__cacheKey) {
      writeCache(cfg.__cacheKey, response.data);
    }
    return response;
  },
  (error: any) => {
    const mapped = mapNetworkError(error);

    if (error && typeof error === "object") {
      error.message = mapped || error.message;
      throw error;
    }

    throw new Error(mapped);
  },
);

async function bikaRequest(payload: BikaRequestPayload = { url: "" }) {
  console.log("bikaRequest", payload);
  const method = toUpperMethod(payload.method);
  const useCache = Boolean(payload.cache && method === "GET");
  const cacheKey = buildCacheKey(payload, method);

  if (useCache) {
    const cachedData = readCache(cacheKey);
    if (cachedData !== undefined) {
      return cachedData;
    }
  }

  const requestConfig: any = {
    url: payload.url,
    method,
    __bikaPayload: payload,
    __useCache: useCache,
    __cacheKey: cacheKey,
  };

  if (method !== "GET" && method !== "HEAD") {
    requestConfig.data = payload.body == null ? {} : payload.body;
  }

  const response = await client.request(requestConfig);
  return response.data;
}

export default {
  bikaRequest,
};
