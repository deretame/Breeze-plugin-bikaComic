import axios from "axios";
import type { BikaRequestPayload } from "./bika-types";
import client, { buildCacheKey, readCache } from "./client";

function toUpperMethod(method: unknown): string {
  const value = String(method || "GET").trim();
  return (value || "GET").toUpperCase();
}

/**
 * 网络层失败重试一次（只对 GET/HEAD）。
 *
 * ECH 的 TLS 抖动（`InvalidContentType`）偶发，宿主那边会同时丢掉缓存的 ECH
 * client，所以重试会重新建连 / 换 hint IP；有 HTTP 响应的错误（4xx/5xx）不重试。
 */
async function requestWithRetry(
  config: Record<string, unknown>,
  retries: number,
): Promise<{ data: unknown }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return (await client.request(config)) as { data: unknown };
    } catch (error) {
      lastError = error;
      const hasResponse = Boolean((error as { response?: unknown })?.response);
      if (hasResponse || attempt === retries) {
        throw error;
      }
      console.warn(
        `[bika.request] retry ${String(config.method)} ${String(config.url)}: ${String((error as Error)?.message ?? error)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw lastError;
}

export async function bikaRequest(payload: BikaRequestPayload = { url: "" }) {
  const resolvedPayload: BikaRequestPayload = {
    ...payload,
  };
  const method = toUpperMethod(resolvedPayload.method);
  const useCache = Boolean(resolvedPayload.cache && method === "GET");
  const cacheKey = buildCacheKey(resolvedPayload, method);

  if (useCache) {
    const cachedData = await readCache(cacheKey);
    if (cachedData !== undefined) {
      return cachedData;
    }
  }

  const requestConfig: Record<string, unknown> = {
    url: resolvedPayload.url,
    method,
    __bikaPayload: resolvedPayload,
    __useCache: useCache,
    __cacheKey: cacheKey,
  };

  if (method !== "GET" && method !== "HEAD") {
    const requestBody = resolvedPayload.body == null ? {} : resolvedPayload.body;
    requestConfig.data = requestBody;
    requestConfig.body =
      typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody);
  }

  const methodAllowsRetry = method === "GET" || method === "HEAD";
  const response = await requestWithRetry(requestConfig, methodAllowsRetry ? 1 : 0);
  return response.data;
}

/**
 * 图片下载：网络层失败重试一次。
 *
 * 和 `bikaRequest` 一样，`InvalidContentType` 这类 TLS 抖动是偶发的；
 * 有 HTTP 响应的错误（404/403 等）不重试，避免把「图真的没了」拖成两次超时。
 */
async function getImageWithRetry(
  targetUrl: string,
  host: string,
  timeout: number,
): Promise<{ data: ArrayBuffer | Uint8Array }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      const response = await axios.get(targetUrl, {
        headers: { Host: host },
        timeout,
        responseType: "arraybuffer",
      });
      return response as { data: ArrayBuffer | Uint8Array };
    } catch (error) {
      lastError = error;
      const hasResponse = Boolean((error as { response?: unknown })?.response);
      if (hasResponse || attempt === 1) {
        throw error;
      }
      console.warn(
        `[bika.image] retry ${targetUrl}: ${String((error as Error)?.message ?? error)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw lastError;
}

export async function fetchImageBytes({
  url = "",
  timeoutMs = 30000,
}: {
  url?: string;
  timeoutMs?: number;
} = {}) {
  const targetUrl = url.trim();
  if (!targetUrl) throw new Error("url 不能为空");

  const { host } = new URL(targetUrl);
  const timeout = Math.max(0, timeoutMs) || 30000;

  const response = await getImageWithRetry(targetUrl, host, timeout);
  return new Uint8Array(response.data);
}
