import { toNum } from "./bika-utils";

export type LoadPluginSettingFn = (
  key: string,
  fallback: unknown,
) => Promise<unknown>;

export function createBikaImageUrlBuilder(loadPluginSetting: LoadPluginSettingFn) {
  return async function buildBikaImageUrl(
    fileServer: unknown,
    pathValue: unknown,
    pictureType: "cover" | "creator" | "favourite" | "comic" | "else" = "cover",
  ) {
    const imageQuality = await loadPluginSetting("image.quality", "original");
    const proxy = toNum(await loadPluginSetting("network.proxy", "3"));
    let url = String(fileServer).trim();
    let path = String(pathValue).trim();

    if (url == "https://storage1.picacomic.com") {
      if (pictureType == "cover") {
        url = "https://img.picacomic.com";
      } else if (pictureType == "creator" || pictureType == "favourite") {
        url =
          proxy == 1
            ? "https://storage.diwodiwo.xyz"
            : "https://s3.picacomic.com";
      } else {
        if (imageQuality != "original") {
          url = "https://img.picacomic.com";
        } else {
          url =
            proxy == 1
              ? "https://storage.diwodiwo.xyz"
              : "https://s3.picacomic.com";
        }
      }
    } else if (url == "https://storage-b.picacomic.com") {
      if (pictureType == "creator") {
        url = "https://storage-b.picacomic.com";
      } else if (pictureType == "cover") {
        url = "https://img.picacomic.com";
      } else if (imageQuality == "original") {
        url = "https://storage-b.diwodiwo.xyz";
      } else if (imageQuality != "original") {
        url = "https://img.picacomic.com";
      }
    }

    if (
      path.includes("picacomic-paint.jpg") ||
      path.includes("picacomic-gift.jpg")
    ) {
      url =
        proxy == 1
          ? "https://storage.diwodiwo.xyz/static"
          : "https://s3.picacomic.com/static";
    }

    if (path.includes("tobeimg/")) {
      path = path.replace("tobeimg/", "");
    } else if (path.includes("tobs/")) {
      path = "static/" + path.replace("tobs/", "");
    } else if (!path.includes("/") && !url.includes("static")) {
      path = "static/" + path;
    }

    return url + "/" + path;
  };
}
