import type {
  CapabilitiesBundleContract,
  SettingsBundleContract,
  UserInfoBundleContract,
} from "../types/type";
import {
  BIKA_HOME_CATEGORY_OPTIONS,
  BIKA_SEARCH_CATEGORY_OPTIONS,
} from "./bika-constants";
import { buildBikaImageUrl } from "./bika-image";
import { bikaRequest } from "./bika-request";
import type { BikaLoginPayload } from "./bika-types";
import { sanitizePath, toBool, toNum, toStrList } from "./bika-utils";
import {
  API_BASE_CACHE_KEY,
  BACKUP_API_BASE,
  DEFAULT_API_BASE,
  getApiBase,
  setApiBase,
} from "./client";
import { BIKA_PLUGIN_ID } from "./info";
import { loadPluginSetting, savePluginSetting } from "./plugin-config";
import { cache, flutterTools } from "./tools";

export { loadPluginSetting } from "./plugin-config";

const API_BASE_SETTING_KEY = "network.apiBase";
const API_BASE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "主线路", value: DEFAULT_API_BASE },
  { label: "备用线路", value: BACKUP_API_BASE },
];

function normalizeApiBase(base: unknown): string {
  const value = String(base ?? "").trim();
  if (!value) return DEFAULT_API_BASE;
  return value.endsWith("/") ? value : `${value}/`;
}

function resolveApiBaseChoice(raw: unknown): string {
  const normalized = normalizeApiBase(raw);
  const supported = new Set(API_BASE_OPTIONS.map((item) => item.value));
  return supported.has(normalized) ? normalized : DEFAULT_API_BASE;
}

async function readApiBaseFromCache(): Promise<string | null> {
  const cached = await cache.get(API_BASE_CACHE_KEY, "");
  const candidate = resolveApiBaseChoice(cached);
  if (!String(cached ?? "").trim()) {
    return null;
  }
  return candidate;
}

async function writeApiBaseToCache(apiBase: string) {
  await cache.set(API_BASE_CACHE_KEY, apiBase);
}

export async function getSettingsBundle(): Promise<SettingsBundleContract> {
  const cachedApiBase = await readApiBaseFromCache();
  if (cachedApiBase) {
    setApiBase(cachedApiBase);
  }

  const [
    account,
    password,
    proxy,
    imageQuality,
    slowDownload,
    blockedCategories,
    blockedHomeCategories,
    apiBase,
  ] = await Promise.all([
    loadPluginSetting("auth.account", ""),
    loadPluginSetting("auth.password", ""),
    loadPluginSetting("network.proxy", "3"),
    loadPluginSetting("image.quality", "original"),
    loadPluginSetting("download.slow", false),
    loadPluginSetting("search.blockedCategories", []),
    loadPluginSetting("home.blockedCategories", []),
    loadPluginSetting(API_BASE_SETTING_KEY, DEFAULT_API_BASE),
  ]);

  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "settings",
      sections: [
        {
          id: "account",
          title: "账号",
          fields: [
            {
              key: "auth.account",
              kind: "text",
              label: "账号",
            },
            {
              key: "auth.password",
              kind: "password",
              label: "密码",
            },
            {
              key: "account.slogan",
              kind: "text",
              label: "更新简介",
              fnPath: "updateProfile",
              persist: false,
            },
            {
              key: "account.password",
              kind: "password",
              label: "更新密码",
              fnPath: "updatePassword",
              persist: false,
            },
          ],
        },
        {
          id: "shield",
          title: "屏蔽设置",
          fields: [
            {
              key: "home.blockedCategories",
              kind: "multiChoice",
              label: "首页屏蔽",
              options: BIKA_HOME_CATEGORY_OPTIONS.map((item) => ({
                label: item,
                value: item,
              })),
            },
            {
              key: "search.blockedCategories",
              kind: "multiChoice",
              label: "分类屏蔽",
              options: BIKA_SEARCH_CATEGORY_OPTIONS.map((item) => ({
                label: item,
                value: item,
              })),
            },
          ],
        },
        {
          id: "network",
          title: "网络设置",
          fields: [
            {
              key: API_BASE_SETTING_KEY,
              kind: "select",
              label: "接口线路",
              fnPath: "saveSettings",
              options: API_BASE_OPTIONS,
            },
          ],
        },
      ],
    },
    data: {
      canShowUserInfo: true,
      values: {
        "auth.account": String(account ?? ""),
        "auth.password": String(password ?? ""),
        "account.slogan": "",
        "account.password": "",
        "network.proxy": String(proxy ?? "3"),
        "image.quality": String(imageQuality ?? "original"),
        "download.slow": toBool(slowDownload, false),
        "search.blockedCategories": toStrList(blockedCategories),
        "home.blockedCategories": toStrList(blockedHomeCategories),
        [API_BASE_SETTING_KEY]: resolveApiBaseChoice(apiBase),
      },
    },
  };
}

export async function saveSettings(
  payload: { values?: Record<string, unknown> } = {},
) {
  const payloadMap = payload as Record<string, unknown>;
  const values = (payloadMap.values ?? {}) as Record<string, unknown>;
  const directValue = payloadMap.value ?? payloadMap[API_BASE_SETTING_KEY];
  const selectedApiBase = resolveApiBaseChoice(
    values[API_BASE_SETTING_KEY] ?? directValue,
  );

  await Promise.all([
    savePluginSetting(API_BASE_SETTING_KEY, selectedApiBase),
    writeApiBaseToCache(selectedApiBase),
  ]);
  setApiBase(selectedApiBase);

  return {
    ok: true,
    data: {
      apiBase: selectedApiBase,
    },
  };
}

export async function getUserInfoBundle(): Promise<UserInfoBundleContract> {
  const apiBase = await getApiBase();
  const profile = await bikaRequest({
    url: `${apiBase}users/profile`,
    method: "GET",
    cache: false,
  });
  const user = (profile as any)?.data?.user ?? {};
  const avatar = user?.avatar ?? {};
  const avatarPath = String(avatar?.path ?? "").trim();
  const avatarFileServer = String(avatar?.fileServer ?? "").trim();
  const avatarUrl =
    avatarPath && avatarFileServer
      ? await buildBikaImageUrl(avatarFileServer, avatarPath, "creator")
      : "";

  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "userInfo",
    },
    data: {
      title: "账号",
      avatar: {
        id: String(user?._id ?? user?.id ?? "me"),
        url: avatarUrl,
        name: String(avatar?.originalName ?? ""),
        path: sanitizePath(avatarPath),
        extern: {},
      },
      lines: [
        `${String(user?.name ?? "")} (${String(user?.slogan ?? "")})`,
        `Lv.${toNum(user?.level, 0)} ${String(user?.title ?? "")}`,
        `经验值: ${toNum(user?.exp, 0)} (${user?.isPunched ? "已签到" : "未签到"})`,
      ],
      extern: {
        isPunched: user?.isPunched === true,
      },
    },
  };
}

export async function updateProfile(payload: Record<string, unknown> = {}) {
  const value = String(payload.value ?? "").trim();
  if (!value) {
    throw new Error("简介不能为空");
  }

  const apiBase = await getApiBase();
  const result = await bikaRequest({
    url: `${apiBase}users/profile`,
    method: "PUT",
    body: JSON.stringify({ slogan: value }),
  });

  return {
    ok: true,
    message: "简介已更新",
    raw: result,
  };
}

export async function updatePassword(payload: Record<string, unknown> = {}) {
  const newPassword = String(payload.value ?? "");
  if (!newPassword.trim()) {
    throw new Error("密码不能为空");
  }

  const oldPassword = String(await loadPluginSetting("auth.password", ""));
  if (!oldPassword) {
    throw new Error("缺少旧密码，请重新登录后再试");
  }

  const apiBase = await getApiBase();
  const result = await bikaRequest({
    url: `${apiBase}users/password`,
    method: "PUT",
    body: JSON.stringify({
      new_password: newPassword,
      old_password: oldPassword,
    }),
  });

  await savePluginSetting("auth.password", newPassword);

  return {
    ok: true,
    message: "密码已更新",
    raw: result,
  };
}

export async function getLoginBundle() {
  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "login",
      title: "哔咔登录",
      fields: [
        { key: "account", kind: "text", label: "账号" },
        { key: "password", kind: "password", label: "密码" },
      ],
      action: {
        fnPath: "loginWithPassword",
        submitText: "登录",
      },
    },
    data: {
      account: String(await loadPluginSetting("auth.account", "")),
      password: String(await loadPluginSetting("auth.password", "")),
    },
  };
}

export async function loginWithPassword(payload: BikaLoginPayload = {}) {
  console.debug("loginWithPassword", payload);
  const account = String(payload.account ?? "").trim();
  const password = String(payload.password ?? "");
  if (!account || !password) {
    throw new Error("账号或密码不能为空");
  }

  const apiBase = await getApiBase();
  const result = await bikaRequest({
    url: `${apiBase}auth/sign-in`,
    method: "POST",
    body: JSON.stringify({ email: account, password }),
  });

  const token = String((result as any)?.data?.token ?? "");
  await Promise.all([
    savePluginSetting("auth.account", account),
    savePluginSetting("auth.password", password),
    savePluginSetting("auth.authorization", token),
  ]);

  return {
    source: BIKA_PLUGIN_ID,
    data: {
      account,
      password,
      token,
    },
    raw: result,
  };
}

function randomRetryDelayMs() {
  const min = 20_000;
  const max = 300_000;
  return Math.floor(min + Math.random() * (max - min));
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function runBikaAuthAndCheckInLoop() {
  while (true) {
    try {
      const account = String(
        await loadPluginSetting("auth.account", ""),
      ).trim();
      const password = String(await loadPluginSetting("auth.password", ""));

      if (!account || !password) {
        console.info("[bika.init] skip auth/checkin: no credentials");
        return;
      }

      await loginWithPassword({ account, password });

      const apiBase = await getApiBase();
      const data = (await bikaRequest({
        url: `${apiBase}users/punch-in`,
        method: "POST",
        body: JSON.stringify({}),
        cache: false,
      })) as any;

      console.info("[bika.init] login + checkin ok", data);
      const status = data?.data?.res?.status;
      if (data?.code === 200 && status && status !== "fail") {
        try {
          flutterTools.showToast({
            message: "哔咔签到成功",
            seconds: 1,
            level: "success",
          });
        } catch (_) {}
      }
      return;
    } catch (error) {
      const delay = randomRetryDelayMs();
      console.warn(
        `[bika.init] login/checkin failed, retry in ${delay}ms`,
        error,
      );
      await waitMs(delay);
    }
  }
}

export async function init() {
  const savedApiBase = await loadPluginSetting(
    API_BASE_SETTING_KEY,
    DEFAULT_API_BASE,
  );
  const selectedApiBase = resolveApiBaseChoice(savedApiBase);
  await writeApiBaseToCache(selectedApiBase);
  setApiBase(selectedApiBase);
  console.info(`[bika.init] api base selected: ${selectedApiBase}`);
  runBikaAuthAndCheckInLoop();

  return {
    source: BIKA_PLUGIN_ID,
    data: {
      ok: true,
      started: true,
      apiBase: await getApiBase(),
    },
  };
}

export async function getCapabilitiesBundle(): Promise<CapabilitiesBundleContract> {
  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0" as const,
      type: "capabilities" as const,
      actions: [
        {
          key: "clear_cache",
          title: "清理插件会话",
          fnPath: "clearPluginSession",
        },
      ],
    },
    data: {
      actions: ["clear_cache"],
    },
  };
}

export async function clearPluginSession() {
  await Promise.all([
    savePluginSetting("auth.account", ""),
    savePluginSetting("auth.password", ""),
    savePluginSetting("auth.authorization", ""),
  ]);

  return {
    ok: true,
    message: "bika 插件会话已清理",
  };
}

export async function dumpRuntimeInfo() {
  return {
    ok: true,
    data: {
      pluginName: "bikaComic",
      now: new Date().toISOString(),
    },
  };
}
