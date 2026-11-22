export const LANGUAGES = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
] as const;

export type Locale = (typeof LANGUAGES)[number]["value"];

export const DEFAULT_LOCALE: Locale = "zh-CN";

export function resolveLocale(value: unknown): Locale {
  return LANGUAGES.find((language) => language.value === value)?.value ?? DEFAULT_LOCALE;
}
