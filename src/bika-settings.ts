import type {
  CapabilitiesBundleContract,
  LoginBundleContract,
  LoginSubmitPayload,
  LoginSubmitResult,
  SettingsBundleContract,
  SettingsSection,
  StringMap,
  UserInfoBundleContract,
} from "breeze-plugin-kit";
import {
  buildLoginBundle,
  cache,
  flutterTools,
  getEchHosts,
  readLoginValues,
  setEchHosts,
} from "breeze-plugin-kit";
import axios from "axios";
import { BIKA_HOME_CATEGORY_OPTIONS, BIKA_SEARCH_CATEGORY_OPTIONS } from "./bika-constants";
import { buildBikaImageUrl } from "./bika-image";
import { bikaRequest } from "./bika-request";
import type { BikaLoginPayload } from "./bika-types";
import { sanitizePath, toBool, toNum, toStrList, toStringMap } from "./bika-utils";
import {
  API_BASE_CACHE_KEY,
  BACKUP_API_BASE,
  DEFAULT_API_BASE,
  ECH_API_HOSTS,
  PART26_API_BASES,
  PINNED_HOSTS,
  getApiBase,
  setApiBase,
} from "./client";
import { BIKA_PLUGIN_ID } from "./info";
import { loadPluginSetting, savePluginSetting } from "./plugin-config";

const API_BASE_SETTING_KEY = "network.apiBase";
/**
 * ECH 要求的最低宿主版本：必须严格高于该版本。
 * 与前置能力同批上线（3.0.38+），更低版本上整个功能不启用。
 */
const NETWORK_HOST_MIN_APP_VERSION = "3.0.37";

function normalizeApiBase(base: unknown): string {
  const value = String(base ?? "").trim();
  if (!value) return DEFAULT_API_BASE;
  return value.endsWith("/") ? value : `${value}/`;
}

/** 宿主 Dart 端会 jsonDecode 持久化值，node polyfill 不会——两侧都容忍引号。 */
function decodePersistedValue(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  try {
    const decoded: unknown = JSON.parse(text);
    if (typeof decoded === "string") return decoded.trim();
  } catch {
    // 非 JSON 字符串，原样返回
  }
  return text;
}

/** 回退链：测试成功前/测试失败时，缓存 → 持久化 → 备用线路（go2778），先凑合用。 */
async function resolveStopgapApiBase(): Promise<string> {
  const cached = decodePersistedValue(await cache.get(API_BASE_CACHE_KEY, ""));
  if (cached) return normalizeApiBase(cached);
  const persisted = decodePersistedValue(await loadPluginSetting(API_BASE_SETTING_KEY, ""));
  if (persisted) return normalizeApiBase(persisted);
  // 官方域（picacomic.com）在墙内被 SNI 阻断，不能当兜底；go2778 是官方分流 1。
  return BACKUP_API_BASE;
}
/**
 * 旧宿主（< 3.0.34，不懂 getLoginBundle）走 settings 账号密码区登录。
 * 三段比较：缺段按 0 补齐，Number(x)||0。
 */
function compareVersions(a: string, b: string): number {
  // dart.getAppVersion 返回 JSON 编码串（首尾带引号），先剥掉。
  const clean = (v: string) =>
    String(v ?? "")
      .trim()
      .replace(/^"+|"+$/g, "");
  const pa = clean(a)
    .split(".")
    .map((x) => Number(x) || 0);
  const pb = clean(b)
    .split(".")
    .map((x) => Number(x) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function isLegacyHost(): Promise<boolean> {
  const version = await flutterTools.getAppVersion();
  return compareVersions(version, "3.0.34") < 0;
}

/**
 * 宿主版本是否支持「ECH + 钉 IP」（严格高于 3.0.37）。
 *
 * 两者用的是同一套宿主 API（`fronting.setEchHosts`），所以共用一个版本门控。
 * 纯 Node 环境（dev-server）没有 bridge，读不到版本，按「不支持」处理，
 * 不能让 init 直接抛错。
 */
async function supportsNetworkHost(): Promise<boolean> {
  try {
    const version = await flutterTools.getAppVersion();
    const supported = compareVersions(version, NETWORK_HOST_MIN_APP_VERSION) > 0;
    console.info(
      `[bika.net] host version ${version || "unknown"} ${supported ? ">" : "<="} ${NETWORK_HOST_MIN_APP_VERSION} -> ${supported ? "enabled" : "disabled"}`,
    );
    return supported;
  } catch (error) {
    console.warn(`[bika.net] getAppVersion failed: ${String((error as Error)?.message ?? error)}`);
    return false;
  }
}

export async function getSettingsBundle(): Promise<SettingsBundleContract> {
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

  const legacyHost = await isLegacyHost();

  return {
    source: BIKA_PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "settings",
      sections: [
        ...(legacyHost
          ? [
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
                ],
              } as SettingsSection,
            ]
          : []),
        {
          id: "account",
          title: "账号",
          fields: [
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
        ...(legacyHost
          ? {
              "auth.account": String(account ?? ""),
              "auth.password": String(password ?? ""),
            }
          : {}),
        "account.slogan": "",
        "account.password": "",
        "network.proxy": String(proxy ?? "3"),
        "image.quality": String(imageQuality ?? "original"),
        "download.slow": toBool(slowDownload, false),
        "search.blockedCategories": toStrList(blockedCategories),
        "home.blockedCategories": toStrList(blockedHomeCategories),
      },
      canLogin: true,
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
  const user = toStringMap(toStringMap(profile).data);
  const profileUser = toStringMap(user.user);
  const avatar = toStringMap(profileUser.avatar);
  const avatarPath = String(avatar.path ?? "").trim();
  const avatarFileServer = String(avatar.fileServer ?? "").trim();
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
        id: String(profileUser._id ?? profileUser.id ?? "me"),
        url: avatarUrl,
        name: String(avatar.originalName ?? ""),
        path: sanitizePath(avatarPath),
        extern: {},
      },
      lines: [
        `${String(profileUser.name ?? "")} (${String(profileUser.slogan ?? "")})`,
        `Lv.${toNum(profileUser.level, 0)} ${String(profileUser.title ?? "")}`,
        `经验值: ${toNum(profileUser.exp, 0)} (${profileUser.isPunched ? "已签到" : "未签到"})`,
      ],
      extern: {
        isPunched: profileUser.isPunched === true,
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

export async function getLoginBundle(): Promise<LoginBundleContract> {
  const account = String(await loadPluginSetting("auth.account", ""));
  const password = String(await loadPluginSetting("auth.password", ""));
  return buildLoginBundle(BIKA_PLUGIN_ID, {
    title: "哔咔登录",
    fields: [
      { key: "account", kind: "text", label: "账号", required: true },
      { key: "password", kind: "password", label: "密码", required: true },
    ],
    submitFnPath: "loginWithPassword",
    submitText: "登录",
    values: { account, password },
  });
}

function readLoginFormValues(payload: BikaLoginPayload = {}) {
  const record = payload as Record<string, unknown>;
  if (record.values !== undefined) {
    const kitValues = readLoginValues(payload as LoginSubmitPayload);
    return {
      account: String(kitValues.account ?? "").trim(),
      password: String(kitValues.password ?? ""),
    };
  }
  return {
    account: String(record.account ?? "").trim(),
    password: String(record.password ?? ""),
  };
}

export async function loginWithPassword(
  payload: BikaLoginPayload = {},
): Promise<LoginSubmitResult> {
  console.debug("loginWithPassword", payload);
  const { account, password } = readLoginFormValues(payload);

  if (!account || !password) {
    throw new Error("账号或密码不能为空");
  }

  const apiBase = await getApiBase();
  const result = await bikaRequest({
    url: `${apiBase}auth/sign-in`,
    method: "POST",
    body: JSON.stringify({ email: account, password }),
  });

  const token = String(toStringMap(toStringMap(result).data).token ?? "");
  await Promise.all([
    savePluginSetting("auth.account", account),
    savePluginSetting("auth.password", password),
    savePluginSetting("auth.authorization", token),
  ]);

  return {
    source: BIKA_PLUGIN_ID,
    message: "登录成功",
    data: {
      account,
      password,
      token,
    },
  };
}

const AUTO_CHECKIN_RETRY_DELAY_MS = 60_000;
let autoCheckInPromise: Promise<void> | null = null;

async function runAutoCheckInUntilSuccess(): Promise<void> {
  if (autoCheckInPromise) {
    return autoCheckInPromise;
  }

  const task = (async () => {
    while (true) {
      try {
        const checkInBase = await getApiBase();
        const data = (await bikaRequest({
          url: `${checkInBase}users/punch-in`,
          method: "POST",
          body: JSON.stringify({}),
          cache: false,
        })) as StringMap;
        const punchData = toStringMap(data.data);
        const status = String(toStringMap(punchData.res).status ?? "");
        // code=200 即完成：status=ok 是本次刚签上才弹提示；
        // status=fail=今日已签过，静默完成、不重试；未知 status 也静默完成，避免误弹。
        // 非 200（限流/掉线）才抛错重试。
        if (Number(data.code) === 200) {
          if (status === "ok") {
            console.info("[bika.init] background checkin done", data);
            try {
              flutterTools.showToast({
                message: "哔咔签到成功",
                seconds: 1,
                level: "success",
              });
            } catch {}
          } else if (status === "fail") {
            console.info("[bika.init] already punched today, skip toast", data);
          } else {
            console.info("[bika.init] checkin done with unknown status, skip toast", data);
          }
          return;
        }
        throw new Error(`签到未成功: code=${String(data.code)} status=${status}`);
      } catch (error) {
        console.warn(
          `[bika.init] background checkin failed, retry in ${AUTO_CHECKIN_RETRY_DELAY_MS}ms`,
          error,
        );
        await new Promise<void>((resolve) => {
          setTimeout(resolve, AUTO_CHECKIN_RETRY_DELAY_MS);
        });
      }
    }
  })();

  autoCheckInPromise = task;
  try {
    await task;
  } finally {
    if (autoCheckInPromise === task) {
      autoCheckInPromise = null;
    }
  }
}

async function loginForInit(): Promise<void> {
  const account = String(await loadPluginSetting("auth.account", "")).trim();
  const password = String(await loadPluginSetting("auth.password", ""));
  if (!account || !password) {
    console.info("[bika.init] skip login: no credentials");
    return;
  }
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await loginWithPassword({ account, password });
      console.info(`[bika.init] login ok (attempt ${attempt})`);
      // 签到不阻塞 init，后台无限重试直到成功。
      void runAutoCheckInUntilSuccess().catch((error) => {
        console.warn("[bika.init] background checkin stopped", error);
      });
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[bika.init] login failed (attempt ${attempt}/3)`, error);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`登录失败，已重试 3 次: ${String(lastError)}`);
}

const PROBE_TIMEOUT_MS = 5_000;

/**
 * 真 API 对未签名请求返回 400 + `{code, error, message}` 的 JSON 信封；
 * 用它区分「真线路」和「占位/被劫持的同码 400」（后者不是 JSON 信封）。
 */
function isBikaApiPayload(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const payload = data as { code?: unknown; message?: unknown };
  return typeof payload.code === "number" && typeof payload.message === "string";
}

/**
 * 单次探测：只有拿到真 API 的 JSON 信封才算可达；超时 / 网络错误 / 其它站点一律 null。
 *
 * 不重试：现在是并发抢答（`pickFastestApiBase`），失败的那条直接输掉，
 * 重试只会把 init 拖长（死线路 5s × 2）。
 */
async function probeApiBaseLatency(apiBase: string, signal: AbortSignal): Promise<number | null> {
  const started = Date.now();
  try {
    const response = await axios.get(apiBase, {
      timeout: PROBE_TIMEOUT_MS,
      adapter: "fetch",
      validateStatus: () => true,
      signal,
    });
    if (!isBikaApiPayload(response.data)) {
      console.warn(`[bika.probe] reject ${apiBase} (not bika api)`);
      return null;
    }
    const elapsed = Date.now() - started;
    console.info(`[bika.probe] ok ${apiBase} ${elapsed}ms`);
    return elapsed;
  } catch (error) {
    if (signal.aborted) return null;
    console.warn(`[bika.probe] fail ${apiBase}: ${String((error as Error)?.message ?? error)}`);
    return null;
  }
}

/**
 * 并发探测，谁先拿到真 API 信封用谁，其余立刻 abort。
 *
 * 以前是 `Promise.all` 等所有线路：官方域在墙内被 SNI 阻断，每次 init 都要
 * 白等 5s（重试后 10s）才继续。现在死线路只是输掉，不影响 init 速度。
 */
async function pickFastestApiBase(candidates: readonly string[]): Promise<string | null> {
  if (candidates.length === 0) return null;

  const controllers = candidates.map(() => new AbortController());
  return new Promise<string | null>((resolve) => {
    let pending = candidates.length;
    let winner: string | null = null;
    const finish = () => {
      pending -= 1;
      if (pending === 0) resolve(winner);
    };

    candidates.forEach((base, index) => {
      probeApiBaseLatency(base, controllers[index].signal)
        .then((ms) => {
          if (ms !== null && winner === null) {
            winner = base;
            // 其余线路立刻取消，别在后台继续等超时。
            controllers.forEach((controller, i) => {
              if (i !== index) controller.abort();
            });
            resolve(base);
            return;
          }
          finish();
        })
        .catch(finish);
    });
  });
}

/**
 * 每次 init 并发探测所有线路，谁先拿到真 API 信封用谁；全部失败返回 null（保持回退值）。
 *
 * 候选 = 官方 + go2778 + part26 五条分流。官方域在墙内基本被 SNI 阻断，
 * 但海外 / 代理环境可能可用，所以保留在候选里（并发抢答，死线路不影响速度）。
 */
async function selectApiBaseByLatency(): Promise<string | null> {
  const candidates = [DEFAULT_API_BASE, BACKUP_API_BASE, ...PART26_API_BASES];
  const winner = await pickFastestApiBase(candidates);
  console.info(`[bika.probe] winner ${winner ?? "none"}`);
  return winner;
}

/**
 * 把支持 ECH 的线路登记给宿主（URL 保持域名、SNI 加密，绕开 SNI 阻断）。
 *
 * 调用方先确认宿主版本 > 3.0.37；`setEchHosts` 内部优先用宿主的 `fronting`
 * 对象、旧宿主回退内部函数，两者都没有时返回 `{ ok: false }`，请求回退普通 TLS。
 * ECHConfig / IP 由宿主用 DoH 的 HTTPS RR 补齐，插件只负责说「这些域名要走 ECH」。
 */
function buildPinnedTable(
  refreshed: Record<string, string[]>,
): Record<string, { ips: string[]; pin: true }> {
  return Object.fromEntries(
    Object.entries(PINNED_HOSTS).map(([host, builtin]) => {
      // 刷新到的 IP 放前面，内置的当兜底：reqwest 会按顺序试，前一个连不上就换下一个。
      const ips = [...new Set([...(refreshed[host] ?? []), ...builtin])];
      return [host, { ips, pin: true }];
    }),
  );
}

function registerEchHosts(refreshed: Record<string, string[]> = {}): boolean {
  // 两类登记：
  // - 走 ECH 的线路：只给域名，ECHConfig / IP 由宿主用 DoH 补；
  // - DNS 被投毒的域（`*.picacomic.com`）：直接钉真 IP + `pin: true`，保留 SNI。
  const table = {
    ...Object.fromEntries(ECH_API_HOSTS.map((host) => [host, {}])),
    ...buildPinnedTable(refreshed),
  };
  const result = setEchHosts(table);
  console.info(`[bika.ech] setEchHosts -> ${JSON.stringify(result)}`);
  if (result.ok) {
    // 读回宿主当前表：ips 为空表示还没拉过 DoH，ech=false 表示宿主还没拿到 ECHConfig。
    const current = getEchHosts();
    console.info(`[bika.ech] host table -> ${JSON.stringify(current)}`);
  }
  return result.ok === true;
}

/** init 的返回值（宿主不关心内容，只关心有没有抛错）。 */
type InitResult = {
  source: string;
  data: { ok: boolean; started: boolean; apiBase: string };
};

let initPromise: Promise<InitResult> | null = null;

const PINNED_IPS_SETTING = "network.pinnedIps";
/** 刷新到的 IP 多久之内不再重查。 */
const PINNED_IPS_TTL_MS = 6 * 60 * 60 * 1000;
/** CF DoH 单次超时：墙内直连必然失败，别拖太久。 */
const PINNED_DOH_TIMEOUT_MS = 3_000;

type PinnedIpsCache = { at: number; hosts: Record<string, string[]> };

async function loadPinnedIps(): Promise<PinnedIpsCache | null> {
  const raw = await loadPluginSetting(PINNED_IPS_SETTING, null);
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as { at?: unknown; hosts?: unknown };
  const at = Number(payload.at);
  if (!Number.isFinite(at) || !payload.hosts || typeof payload.hosts !== "object") {
    return null;
  }
  const hosts: Record<string, string[]> = {};
  for (const [host, ips] of Object.entries(payload.hosts as Record<string, unknown>)) {
    if (!Array.isArray(ips)) continue;
    const list = ips.filter((ip): ip is string => typeof ip === "string" && ip.trim() !== "");
    if (list.length > 0) hosts[host] = list;
  }
  return { at, hosts };
}

async function savePinnedIps(hosts: Record<string, string[]>): Promise<void> {
  await savePluginSetting(PINNED_IPS_SETTING, { at: Date.now(), hosts });
}

/**
 * 用 Cloudflare DoH 查真实 IP。
 *
 * 只有走代理 / TUN / 海外网络时才通——墙内直连 `1.1.1.1:443` 是黑洞。
 * 所以调用方必须把它当「锦上添花」：拿不到就继续用内置 IP。
 */
async function fetchRealIps(host: string): Promise<string[] | null> {
  const url = `https://1.1.1.1/dns-query?name=${encodeURIComponent(host)}&type=A`;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(PINNED_DOH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      Answer?: Array<{ type?: number; data?: string }>;
    };
    const ips = (payload.Answer ?? [])
      .filter((item) => item.type === 1 && typeof item.data === "string")
      .map((item) => String(item.data).trim())
      .filter((ip) => ip !== "");
    return ips.length > 0 ? ips : null;
  } catch {
    return null;
  }
}

/**
 * 后台刷新钉 IP 表：先探一个域名，通了再并发补齐其余，最后重新登记。
 *
 * 不通（墙内直连）就直接放弃，继续用内置 IP——不会拖慢 init。
 */
async function refreshPinnedIps(): Promise<void> {
  const hosts = Object.keys(PINNED_HOSTS);
  const [first, ...rest] = hosts;
  if (!first) return;

  const firstIps = await fetchRealIps(first);
  if (!firstIps) {
    console.info("[bika.pin] cf doh unreachable, keep builtin ips");
    return;
  }

  const refreshed: Record<string, string[]> = { [first]: firstIps };
  const results = await Promise.all(
    rest.map(async (host) => [host, await fetchRealIps(host)] as const),
  );
  for (const [host, ips] of results) {
    if (ips) refreshed[host] = ips;
  }

  await savePinnedIps(refreshed);
  registerEchHosts(refreshed);
  console.info(`[bika.pin] refreshed ${Object.keys(refreshed).length}/${hosts.length} hosts`);
}

/**
 * 宿主会在多个时机调 init（页面打开、插件同步、runtime 重建后），
 * 同一 runtime 内只跑一次：测速 + 登录都是网络请求，重复跑纯属浪费。
 *
 * 失败不缓存，允许宿主下次重试。
 */
export function init(): Promise<InitResult> {
  initPromise ??= runInit().catch((error) => {
    initPromise = null;
    throw error;
  });
  return initPromise;
}

async function runInit(): Promise<InitResult> {
  // ECH + 钉 IP：宿主版本 > 3.0.37 且具备能力时才登记；先登记，后面的测速 / 登录请求
  // 才会走「加密 SNI」或「钉 IP + 正常 SNI」。
  const networkHostOk = await supportsNetworkHost();
  const storedPinned = await loadPinnedIps();
  const hostsRegistered = networkHostOk && registerEchHosts(storedPinned?.hosts ?? {});
  console.info(
    `[bika.init] network hosts ${hostsRegistered ? "registered" : networkHostOk ? "unsupported" : "version-too-old"}` +
      `, pinned ips ${storedPinned ? "cached" : "builtin"}`,
  );

  // 后台刷新钉 IP：走 CF DoH，墙内直连会超时，失败就继续用内置 IP。
  if (networkHostOk && (!storedPinned || Date.now() - storedPinned.at > PINNED_IPS_TTL_MS)) {
    void refreshPinnedIps().catch((error) => console.warn("[bika.pin] refresh failed", error));
  }

  // 回退：测试成功前/测试失败时，缓存 → 持久化 → 备用线路，先凑合用。
  const stopgapApiBase = await resolveStopgapApiBase();
  setApiBase(stopgapApiBase);
  console.info(`[bika.init] stopgap api base: ${stopgapApiBase}`);

  // 先测延迟，用延迟最低的线路登录。
  const winner = await selectApiBaseByLatency();
  const selectedApiBase = winner ?? stopgapApiBase;
  if (!winner) {
    console.warn(`[bika.init] latency probe failed on all lines, keep stopgap: ${stopgapApiBase}`);
  } else if (winner !== stopgapApiBase) {
    setApiBase(winner);
    console.info(`[bika.init] api base selected: ${winner}`);
  } else {
    console.info(`[bika.init] probe confirmed stopgap line: ${winner}`);
  }

  try {
    // 走完登录（最多 3 次）才算 init 成功；无账号直接返回成功。
    await loginForInit();
  } finally {
    // init 结束后把生效线路写进持久化 + 缓存。
    await Promise.all([
      savePluginSetting(API_BASE_SETTING_KEY, selectedApiBase),
      cache.set(API_BASE_CACHE_KEY, selectedApiBase),
    ]);
    console.info(`[bika.init] api base persisted: ${selectedApiBase}`);
  }

  return {
    source: BIKA_PLUGIN_ID,
    data: {
      ok: true,
      started: true,
      apiBase: selectedApiBase,
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
