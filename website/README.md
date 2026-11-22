# BiliDanmu 网站

BiliDanmu 的发布页与文档站，基于 **Astro 7 + AstroWind（MIT）+ Starlight（MIT）** 搭建。

- 发布页：`src/pages/index.astro`，区块在 `src/components/landing/`，视觉样式在 `src/assets/styles/landing.css`
- 文档：`src/content/docs/docs/`，线上路径 `/docs/...`；已从旧 Docusaurus 站全量迁移（guide / architecture / api / research，共 25 篇 + 文档首页 + FAQ）
- 站点配置：`src/config.yaml`（站点名、SEO、主题）、`src/navigation.ts`（导航/页脚）
- 品牌令牌：`src/components/CustomStyles.astro`（首页）、`src/assets/styles/starlight.css`（文档）
- 产品截图：`src/assets/images/bilidanmu/`（弹幕窗、设置面板截图来自 `BILIDANMU_MOCK=1` 的虚拟直播间，内容为虚构）
- 产品演示：`public/marketing/product-film.mp4`（由 `docs/static/marketing/product-film.mp4` 压到 1080p / 3.8MB 的 Web 版本）
- Mermaid：`astro-mermaid` 集成，文档里的 ```mermaid 图会自动渲染并跟随明暗主题

## 本地开发

```bash
npm install
npm run dev
```

由于站点部署在 GitHub Pages 的子路径，开发地址是 `http://localhost:4321/bilidanmu/`。

## 构建与预览

```bash
npm run build
npm run check:astro
npm run preview
```

构建产物在 `dist/`，纯静态，可直接部署到 GitHub Pages。

## 部署

`.github/workflows/deploy-docs.yml` 在 `main` 分支的 `website/**` 变化时构建本目录并部署到 GitHub Pages。旧 `docs/` Docusaurus 站保留作参考，不再参与部署。

旧文档 URL（`/guide/...`、`/architecture/...`、`/api/...`、`/research/...`）在 `astro.config.ts` 的 `redirects` 中重定向到新的 `/docs/...` 路径。

## 部署路径

站点固定部署在 `https://sfqy211.github.io/bilidanmu/`。如果域名或仓库名变化，同时修改：

- `astro.config.ts` 的 `site` / `base`
- `src/config.yaml` 的 `site.site` / `site.base`

## 与主应用的关系

本目录是独立的静态站点，不参与 Tauri 应用构建。仓库根目录的 `postcss.config.js` / `tailwind.config.ts` 属于主应用；`astro.config.ts` 里显式清空了 PostCSS 插件，避免 Astro 向上查找时误用主应用的 Tailwind 3 配置。

## 说明

- 模板：AstroWind（MIT，Copyright © 2023 onWidget）与 Starlight（MIT，Copyright © withastro）。
- 模板自带的演示图片与文章已移除，仓库内只保留 BiliDanmu 自己的截图与文案。
- 许可证与第三方声明见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
