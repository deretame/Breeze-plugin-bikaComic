import axios, { AxiosHeaders } from "axios";
import { buildUnauthorizedError, cache, hostRuntime } from "breeze-plugin-kit";
import { loadPluginSetting } from "./plugin-config";

const BIKA_PLUGIN_ID = "0a0e5858-a467-4702-994a-79e608a4589d";

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

/**
 * 官方主域。墙内基本被 SNI 阻断（DNS 能解出真 IP，但 TLS 握手超时），
 * 所以只当探测候选，**不能**当兜底线路。
 */
export const DEFAULT_API_BASE = "https://picaapi.picacomic.com/";
/** 官方分流 1，墙内可用；也是探测全失败时的兜底。 */
export const BACKUP_API_BASE = "https://picaapi.go2778.com/";
// 以下来自 picacg v2.6.74 拆包：
// part26.* 是 domain/model/RouteTarget.java 里的分流 2~6，API 基址统一拼成
// https://picaapi.<domain>/（defpackage/g04.java:262）。
//
// 拆包里的智能优选候选池还有 sl2608p.top / cloudflare-ech.com，但这两个域
// 现在是真的 NXDOMAIN（不是 DNS 污染，DoH 查也是 Status=3），已从候选里删掉。
export const PART26_API_BASES = [
  "https://picaapi.part26.art/",
  "https://picaapi.part26.click/",
  "https://picaapi.part26.help/",
  "https://picaapi.part26.sbs/",
  "https://picaapi.part26.top/",
] as const;
/**
 * 支持 ECH 的线路域（DoH 的 HTTPS RR 里带 `ech=` 参数）。
 *
 * 这些线路必须看 SNI，无 SNI 前置会被 Cloudflare 拒绝；交给宿主走 ECH：
 * URL 保持域名、SNI 加密（外层是 ECHConfig 的 public_name），IP 用 DoH 的
 * `ipv4hint` 钉死，绕开 DNS 污染。
 */
export const ECH_API_HOSTS = [
  "picaapi.go2778.com",
  "picaapi.part26.art",
  "picaapi.part26.click",
  "picaapi.part26.help",
  "picaapi.part26.sbs",
  "picaapi.part26.top",
] as const;
/**
 * DNS 被投毒的域：直接钉真 IP（保留 SNI），绕过 DNS 解析。
 *
 * `*.picacomic.com` 在墙内是**递归层投毒**（阿里 / 腾讯 DoH 都返回假 IP，
 * 比如 `img.picacomic.com` 被指到 Facebook 的段），但真 IP 直连 TLS 是通的
 * （实测 200，0.7~1.0s）。这组 IP 来自 Cloudflare DoH（`1.1.1.1`）。
 *
 * 宿主侧走 `pin: true`：URL 保持域名、SNI 正常，只把 DNS 换成这里登记的 IP。
 * 不能用前置（`setFrontHosts`）——Cloudflare 对无 SNI 的连接直接
 * `handshake failure`。
 */
export const PINNED_HOSTS: Record<string, string[]> = {
  // 官方 API（探测候选之一，钉 IP 后能返回真 API 信封）
  "picaapi.picacomic.com": ["172.66.173.71", "104.20.42.9"],
  // 图片域：bika-image.ts 里会用到的那几个
  "img.picacomic.com": ["172.66.173.71", "104.20.42.9"],
  "s3.picacomic.com": ["172.66.173.71", "104.20.42.9"],
  "storage1.picacomic.com": ["172.66.173.71", "104.20.42.9"],
  "storage-b.picacomic.com": ["172.66.173.71", "104.20.42.9"],
};
export const API_BASE_CACHE_KEY = "bika:network.apiBase";
export let API_BASE = BACKUP_API_BASE;
export const CACHE_KEY_PREFIX = "bikaComic:requestCache:";
const API_KEY = "C69BAF41DA5ABD1FFEDC6D2FEA56B";
const SECRET_KEY = "~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn";
const CACHE_TTL_MS = 10 * 60 * 1000;

function normalizeApiBase(base: string): string {
  const value = String(base || "").trim();
  if (!value) return "";
  return value.endsWith("/") ? value : `${value}/`;
}

export function setApiBase(base: string) {
  console.info(`setApiBase: ${base}`);
  const normalized = normalizeApiBase(base);
  // 空值兜底用 go2778：官方域在墙内被 SNI 阻断，不能当默认值。
  API_BASE = normalized || BACKUP_API_BASE;
}

export async function getApiBase() {
  // 生效基址以模块状态为准（init 已写入）；不再回读宿主缓存，
  // 避免缓存 TTL 过期后静默退回默认线路。
  return API_BASE;
}

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
  return structuredClone(input);
}

async function writeCache(cacheKey: string, data: unknown) {
  await cache.set(toCacheStorageKey(cacheKey), {
    expireAt: Date.now() + CACHE_TTL_MS,
    data: deepClone(data),
  } satisfies CacheEntry);
}

function isCacheEntry(v: unknown): v is CacheEntry {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  if (!("expireAt" in v)) return false;
  return typeof v.expireAt === "number";
}

export async function readCache(cacheKey: string): Promise<unknown | undefined> {
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
  const digest = hostRuntime.crypto.createHash("sha256").update(rawKey).digest("hex") as string;
  return `v1:${digest}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function randomHex(len: number): string {
  let out = "";
  while (out.length < len) {
    out += hostRuntime.uuidv4().split("-").join("");
  }
  return out.slice(0, len);
}

function toUpperMethod(method: unknown): string {
  const value = String(method || "GET").trim();
  return (value || "GET").toUpperCase();
}

function cleanPath(input: string): string {
  const value = String(input || "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      return `${parsed.pathname}${parsed.search}`.replace(/^\/+/, "");
    } catch {
      // ignore parse error
    }
  }

  return value.replace(DEFAULT_API_BASE, "").replace(BACKUP_API_BASE, "").replace(/^\/+/, "");
}

function createSignature(path: string, timestamp: number, nonce: string, method: string): string {
  const raw = `${path}${timestamp}${nonce}${method}${API_KEY}`.toLowerCase();
  return hostRuntime.crypto.createHmac("sha256", SECRET_KEY).update(raw).digest("hex") as string;
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
  timeout: 10_000,
  adapter: "fetch",
});

bikaClient.interceptors.request.use(async (config) => {
  const payload = ((config as unknown as { __bikaPayload?: ClientPayload }).__bikaPayload ??
    {}) as Partial<ClientPayload>;
  const method = toUpperMethod(config.method);
  const requestUrl = String(config.url || "");
  const nonce = randomHex(32);
  const timestamp = nowSeconds();
  const path = cleanPath(requestUrl);

  const imageQuality = "original";
  const authorization = String(await loadPluginSetting("auth.authorization", "")).trim();
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
      (data?.code === 401 && data?.error === "1005" && data?.message === "unauthorized")
    ) {
      throw buildUnauthorizedError(BIKA_PLUGIN_ID, "登录过期，请重新登录");
    }

    const mapped = mapNetworkError(error);

    if (error && typeof error === "object") {
      (error as { message?: string }).message = mapped || (error as { message?: string }).message;
      throw error;
    }

    throw new Error(mapped);
  },
);

export default bikaClient;
