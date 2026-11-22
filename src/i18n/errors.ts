import { i18n } from "./index";

export function describeDesktopError(error: unknown, summary: string): string {
  const detail = typeof error === "string"
    ? error
    : error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  const code = error && typeof error === "object" && "code" in error ? Number(error.code) : undefined;
  if (code === -101 || /错误码 -101(?:）)?$/.test(detail) || detail === "登录已过期，请重新登录后再送礼") {
    return i18n.t("desktop:api.signInExpired");
  }
  if (detail === "发送排队超时：当前发送频率受限，请稍后再试") {
    return i18n.t("desktop:api.rateLimited");
  }
  return detail ? i18n.t("desktop:api.errorDetails", { summary, detail }) : summary;
}
