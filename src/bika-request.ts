import axios from "axios";
import { runtime } from "../types/runtime-api";
import client, { buildCacheKey, readCache } from "./client";
import type { BikaRequestPayload } from "./bika-types";

function toUpperMethod(method: unknown): string {
  const value = String(method || "GET").trim();
  return (value || "GET").toUpperCase();
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

  const requestConfig: any = {
    url: resolvedPayload.url,
    method,
    __bikaPayload: resolvedPayload,
    __useCache: useCache,
    __cacheKey: cacheKey,
  };

  if (method !== "GET" && method !== "HEAD") {
    const requestBody =
      resolvedPayload.body == null ? {} : resolvedPayload.body;
    requestConfig.data = requestBody;
    requestConfig.body =
      typeof requestBody === "string"
        ? requestBody
        : JSON.stringify(requestBody);
  }

  const response = await client.request(requestConfig);
  return response.data;
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

  const response = await axios.get(targetUrl, {
    headers: { Host: host },
    timeout: Math.max(0, timeoutMs) || 30000,
    responseType: "arraybuffer",
  });

  const nativeBufferId = await runtime.native.put(
    new Uint8Array(response.data),
  );

  return { nativeBufferId: Number(nativeBufferId) };
}
