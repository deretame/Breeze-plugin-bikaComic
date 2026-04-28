import {
  BIKA_HOME_CATEGORY_OPTIONS,
  BIKA_SEARCH_CATEGORY_OPTIONS,
} from "./bika-constants";
import type { BikaLoginPayload, BikaRequestPayload } from "./bika-types";
import { sanitizePath, toBool, toNum, toStrList } from "./bika-utils";
import { API_BASE, API_BASE_CANDIDATES, selectBestApiBase } from "./client";
import { BIKA_PLUGIN_ID } from "./info";
import { loadPluginSetting, savePluginSetting } from "./plugin-config";
import { flutterTools } from "./tools";

export { loadPluginSetting } from "./plugin-config";

type BikaRequestFn = (payload: BikaRequestPayload) => Promise<unknown>;
type BuildBikaImageUrlFn = (
  fileServer: unknown,
  pathValue: unknown,
  pictureType?: "cover" | "creator" | "favourite" | "comic" | "else",
) => Promise<string>;

type SettingsHandlerDeps = {
  bikaRequest: BikaRequestFn;
  buildBikaImageUrl: BuildBikaImageUrlFn;
  loadPluginSetting: typeof loadPluginSetting;
};

export function createSettingsHandlers({
  bikaRequest,
  buildBikaImageUrl,
  loadPluginSetting,
}: SettingsHandlerDeps) {
  let bikaAuthFlowStarted = false;
  let bikaAuthFlowRunning = false;
  let apiBaseChecked = false;

  async function getSettingsBundle() {
    const [
      account,
      password,
      proxy,
      imageQuality,
      slowDownload,
      blockedCategories,
      blockedHomeCategories,
    ] = await Promise.all([
      loadPluginSetting("auth.account", ""),
      loadPluginSetting("auth.password", ""),
      loadPluginSetting("network.proxy", "3"),
      loadPluginSetting("image.quality", "original"),
      loadPluginSetting("download.slow", false),
      loadPluginSetting("search.blockedCategories", []),
      loadPluginSetting("home.blockedCategories", []),
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
        },
      },
    };
  }

  async function getUserInfoBundle() {
    const profile = await bikaRequest({
      url: `${API_BASE}users/profile`,
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

  async function updateProfile(payload: Record<string, unknown> = {}) {
    const value = String(payload.value ?? "").trim();
    if (!value) {
      throw new Error("简介不能为空");
    }

    const result = await bikaRequest({
      url: `${API_BASE}users/profile`,
      method: "PUT",
      body: JSON.stringify({ slogan: value }),
    });

    return {
      ok: true,
      message: "简介已更新",
      raw: result,
    };
  }

  async function updatePassword(payload: Record<string, unknown> = {}) {
    const newPassword = String(payload.value ?? "");
    if (!newPassword.trim()) {
      throw new Error("密码不能为空");
    }

    const oldPassword = String(await loadPluginSetting("auth.password", ""));
    if (!oldPassword) {
      throw new Error("缺少旧密码，请重新登录后再试");
    }

    const result = await bikaRequest({
      url: `${API_BASE}users/password`,
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

  async function getLoginBundle() {
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

  async function loginWithPassword(payload: BikaLoginPayload = {}) {
    console.debug("loginWithPassword", payload);
    const account = String(payload.account ?? "").trim();
    const password = String(payload.password ?? "");
    if (!account || !password) {
      throw new Error("账号或密码不能为空");
    }

    const result = await bikaRequest({
      url: `${API_BASE}auth/sign-in`,
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
    if (bikaAuthFlowRunning) {
      return;
    }
    bikaAuthFlowRunning = true;
    try {
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

          const data = (await bikaRequest({
            url: `${API_BASE}users/punch-in`,
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
    } finally {
      bikaAuthFlowRunning = false;
    }
  }

  async function init() {
    if (!apiBaseChecked) {
      apiBaseChecked = true;
      const probe = await selectBestApiBase({
        candidates: Array.from(API_BASE_CANDIDATES),
        timeoutMs: 10_000,
      });
      console.info(
        `[bika.init] api base selected: ${probe.selected} (fallbackUsed=${String(probe.fallbackUsed)})`,
      );
    }

    if (!bikaAuthFlowStarted) {
      bikaAuthFlowStarted = true;
      void runBikaAuthAndCheckInLoop();
    }

    return {
      source: BIKA_PLUGIN_ID,
      data: {
        ok: true,
        started: true,
        apiBase: API_BASE,
      },
    };
  }

  async function getCapabilitiesBundle() {
    return {
      source: BIKA_PLUGIN_ID,
      scheme: {
        version: "1.0.0",
        type: "advancedActions",
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

  async function clearPluginSession() {
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

  async function dumpRuntimeInfo() {
    return {
      ok: true,
      data: {
        pluginName: "bikaComic",
        now: new Date().toISOString(),
      },
    };
  }

  return {
    getSettingsBundle,
    getUserInfoBundle,
    updateProfile,
    updatePassword,
    getLoginBundle,
    loginWithPassword,
    init,
    getCapabilitiesBundle,
    clearPluginSession,
    dumpRuntimeInfo,
  };
}
