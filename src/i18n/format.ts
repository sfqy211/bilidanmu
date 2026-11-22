import { i18n } from "./index";
import { DEFAULT_LOCALE } from "./languages";

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(i18n.resolvedLanguage ?? DEFAULT_LOCALE, options).format(value);
}

export function formatDate(value: Date, options: Intl.DateTimeFormatOptions): string {
  if (!Number.isFinite(value.getTime())) return "";
  return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LOCALE, options).format(value);
}
