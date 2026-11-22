import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE, LANGUAGES } from "./languages";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof zhCN;
  }
}

export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources: { "zh-CN": zhCN, en },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: LANGUAGES.map(({ value }) => value),
  defaultNS: "common",
  initAsync: false,
  interpolation: { escapeValue: false },
});

export { useTranslation } from "react-i18next";
