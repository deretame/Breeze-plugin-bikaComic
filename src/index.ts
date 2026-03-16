import axios from "axios";
import { runtime } from "../type/runtime-api";
import client, { buildCacheKey, readCache } from "./client";

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

function toUpperMethod(method: unknown): string {
  const value = String(method || "GET").trim();
  return (value || "GET").toUpperCase();
}

async function bikaRequest(payload: BikaRequestPayload = { url: "" }) {
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
    const requestBody = payload.body == null ? {} : payload.body;
    requestConfig.data = requestBody;
    requestConfig.body =
      typeof requestBody === "string"
        ? requestBody
        : JSON.stringify(requestBody);
  }

  const response = await client.request(requestConfig);
  return response.data;
}

async function fetchImageBytes({ url = "", timeoutMs = 30000 } = {}) {
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

export default {
  bikaRequest,
  fetchImageBytes,
};
