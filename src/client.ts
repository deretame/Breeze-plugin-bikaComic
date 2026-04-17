import axios, { AxiosHeaders } from "axios";
import { runtime } from "../types/runtime-api";
import { cache } from "./tools";
import { loadPluginSetting } from "./plugin-config";

type UnauthorizedErrorPayload = {
  type: "unauthorized";
  source: string;
  message: string;
  scheme?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

const BIKA_PLUGIN_ID = "0a0e5858-a467-4702-994a-79e608a4589d";

let unauthorizedSchemeProvider:
  | (() => Promise<Record<string, unknown> | undefined>)
  | null = null;

export function setUnauthorizedSchemeProvider(
  provider: () => Promise<Record<string, unknown> | undefined>,
) {
  unauthorizedSchemeProvider = provider;
}

async function buildUnauthorizedError(
  message = "登录过期，请重新登录",
): Promise<Error> {
  const payload: UnauthorizedErrorPayload = {
    type: "unauthorized",
    source: BIKA_PLUGIN_ID,
    message,
  };
  try {
    const bundle = await unauthorizedSchemeProvider?.();
    if (bundle && typeof bundle === "object") {
      payload.scheme = (bundle.scheme as Record<string, unknown>) ?? undefined;
      payload.data = (bundle.data as Record<string, unknown>) ?? undefined;
    }
  } catch (_) {
    // ignore scheme build errors
  }
  return new Error(JSON.stringify(payload));
}

type ClientPayload = {
  url?: string;
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

export const API_BASE = "https://picaapi.picacomic.com/";
export const CACHE_KEY_PREFIX = "bikaComic:requestCache:";
const API_KEY = "C69BAF41DA5ABD1FFEDC6D2FEA56B";
const SECRET_KEY =
  "~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn";
const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  expireAt: number;
  data: unknown;
};

function toCacheStorageKey(cacheKey: string): string {
  return `${CACHE_KEY_PREFIX}${cacheKey}`;
}

function deepClone<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }
  return JSON.parse(JSON.stringify(input)) as T;
}

async function writeCache(cacheKey: string, data: unknown) {
  await cache.set(toCacheStorageKey(cacheKey), {
    expireAt: Date.now() + CACHE_TTL_MS,
    data: deepClone(data),
  } satisfies CacheEntry);
}

function isCacheEntry(v: unknown): v is CacheEntry {
  return (
    !!v && typeof v === "object" && typeof (v as any).expireAt === "number"
  );
}

export async function readCache(
  cacheKey: string,
): Promise<unknown | undefined> {
  const key = toCacheStorageKey(cacheKey);

  const entry = (await cache.get(key, undefined)) as CacheEntry | undefined;

  if (!entry) return undefined;
  if (!isCacheEntry(entry)) {
    await cache.delete(key);
    return undefined;
  }

  if (entry.expireAt <= Date.now()) {
    await cache.delete(key);
    return undefined;
  }

  return deepClone(entry.data);
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

export function buildCacheKey(payload: ClientPayload, method: string): string {
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

const bikaClient = axios.create({
  baseURL: API_BASE,
  timeout: 10_000,
  adapter: "fetch",
});

bikaClient.interceptors.request.use(async (config) => {
  const payload = ((config as unknown as { __bikaPayload?: ClientPayload })
    .__bikaPayload ?? {}) as Partial<ClientPayload>;
  const method = toUpperMethod(config.method);
  const requestUrl = String(config.url || "");
  const nonce = randomHex(32);
  const timestamp = nowSeconds();
  const path = cleanPath(requestUrl);

  const imageQuality = "original";
  const authorization = String(
    await loadPluginSetting("auth.authorization", ""),
  ).trim();
  const appChannel = String(payload.settings?.proxy || "3");
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

  if (authorization.trim()) {
    headers.set("authorization", authorization);
  }

  config.method = method;
  config.headers = headers;
  return config;
});

bikaClient.interceptors.response.use(
  async (response) => {
    const cfg = response.config as {
      __cacheKey?: string;
      __useCache?: boolean;
    };

    if (cfg.__useCache && cfg.__cacheKey) {
      await writeCache(cfg.__cacheKey, response.data);
    }

    return response;
  },
  async (error: unknown) => {
    const e = error as {
      response?: {
        data?: { code?: number; message?: string; error?: string };
        status?: number;
      };
    };
    const data = e?.response?.data;
    if (
      e?.response?.status === 401 ||
      (data?.code === 401 &&
        data?.error === "1005" &&
        data?.message === "unauthorized")
    ) {
      throw await buildUnauthorizedError("登录过期，请重新登录");
    }

    const mapped = mapNetworkError(error);

    if (error && typeof error === "object") {
      (error as { message?: string }).message =
        mapped || (error as { message?: string }).message;
      throw error;
    }

    throw new Error(mapped);
  },
);

export default bikaClient;
