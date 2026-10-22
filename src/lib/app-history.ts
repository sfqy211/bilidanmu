/** 记录离开播放器之前的浏览位置，供播放页返回键使用（默认回到听视频首页）。 */
let rememberedRoute = "/listen";

export function rememberRoute(path: string): void {
  rememberedRoute = path;
}

export function getRememberedRoute(): string {
  return rememberedRoute;
}
