import i18next from "i18next";
import { getLanguage } from "obsidian";

import en from "./lang/en.json";
import zhCN from "./lang/zh-CN.json";

interface ObsidianAppFallback {
  vault?: { config?: { language?: string } };
  settings?: { language?: string };
  lang?: string;
}

// 获取 Obsidian 语言设置 - 使用官方推荐的方法
function getObsidianLanguage(): string {
  let language = "en";

  try {
    // 使用 Obsidian 官方提供的 API 方法
    language = getLanguage();
  } catch (error) {
    console.error("Failed to get Obsidian language using API:", error);

    // API 方法失败时的 fallback 方案
    try {
      // 尝试通过内部属性获取
      const app = (typeof window !== "undefined" && (window as Window & { app?: ObsidianAppFallback }).app);
      if (app) {
        if (app.vault?.config?.language) {
          language = app.vault.config.language;
        } else if (app.settings?.language) {
          language = app.settings.language;
        } else if (app.lang) {
          language = app.lang;
        }
      }
    } catch (fallbackError) {
      console.error("Fallback language detection failed:", fallbackError);
    }
  }

  // 简化语言标签：zh-CN, zh-TW, zh-HK 等都映射到 zh-CN
  if (language && language.startsWith("zh")) {
    return "zh-CN";
  }

  return language || "en";
}

// 初始化 i18next
void i18next.init({
  lng: getObsidianLanguage(),
  fallbackLng: {
    "zh-TW": ["zh-CN", "en"],
    "zh-HK": ["zh-CN", "en"],
    "zh": ["zh-CN", "en"],
    default: ["en"]
  },
  resources: {
    en: en,
    "zh-CN": zhCN
  },
  interpolation: {
    escapeValue: false
  }
});

// 导出翻译函数
export const t = i18next.t.bind(i18next);

// 导出 i18next 实例以便高级使用
export { i18next };

// 导出获取和更新语言的函数
export function changeLanguage(lng: string) {
  void i18next.changeLanguage(lng);
}

// 导出检测并更新语言的函数
export function updateLanguage() {
  const newLang = getObsidianLanguage();
  if (newLang && newLang !== i18next.language) {
    void i18next.changeLanguage(newLang);
  }
}