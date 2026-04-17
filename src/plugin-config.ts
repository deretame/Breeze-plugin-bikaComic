import { pluginConfig } from "./tools";

export async function loadPluginSetting(key: string, fallback: unknown) {
  const raw = await pluginConfig.load(key, JSON.stringify(fallback));
  try {
    if (raw && typeof raw === "object") {
      const payload = raw as Record<string, unknown>;
      if (payload.ok === true) {
        return payload.value;
      }
    }

    const decoded = JSON.parse(String(raw));
    if (decoded?.ok === true) {
      return decoded.value;
    }
  } catch {
    // noop
  }
  return fallback;
}

export async function savePluginSetting(key: string, value: unknown) {
  await pluginConfig.save(key, JSON.stringify(value));
}
