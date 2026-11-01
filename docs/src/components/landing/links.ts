export interface LandingProps {
  base: string;
  cleanUrls: boolean;
  assetBase: string;
}

/**
 * 内链规范化：在 base 之上处理 cleanUrls。
 * GitHub Pages 不支持无扩展名路由（/guide/foo 会 404），Pages 构建
 * （cleanUrls=false）时内部页链接需补 .html；锚点插在后缀之前，
 * 目录路径（以 / 结尾）由 Pages 自动解析 index.html，保持原样。
 */
export function createLink(base: string, cleanUrls: boolean) {
  const root = base.endsWith("/") ? base : `${base}/`;

  return (path: string) => {
    const url = `${root}${path.replace(/^\//, "")}`;
    if (cleanUrls) return url;

    const hashIndex = url.indexOf("#");
    const pathPart = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
    const suffixed =
      pathPart.endsWith("/") || pathPart.endsWith(".html") ? pathPart : `${pathPart}.html`;

    return `${suffixed}${hash}`;
  };
}

export function createAsset(assetBase: string) {
  return (file: string) => `${assetBase}${file}`;
}
