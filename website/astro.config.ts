import path from 'path';
import { fileURLToPath } from 'url';

import { defineConfig } from 'astro/config';

import { unified } from '@astrojs/markdown-remark';

import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import partytown from '@astrojs/partytown';
import icon from 'astro-icon';
import compress from 'astro-compress';
import type { AstroIntegration } from 'astro';

import astrowind from './vendor/integration';

import { readingTimeRemarkPlugin, responsiveTablesRehypePlugin } from './src/utils/frontmatter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const hasExternalScripts = false;
const whenExternalScripts = (items: (() => AstroIntegration) | (() => AstroIntegration)[] = []) =>
  hasExternalScripts ? (Array.isArray(items) ? items.map((item) => item()) : [items()]) : [];

export default defineConfig({
  output: 'static',
  site: 'https://sfqy211.github.io',
  base: '/bilidanmu',
  trailingSlash: 'always',
  redirects: {
    '/guide/quick-start': '/bilidanmu/docs/guide/quick-start/',
    '/guide/start': '/bilidanmu/docs/guide/start/',
    '/guide/install': '/bilidanmu/docs/guide/install/',
    '/guide/features': '/bilidanmu/docs/guide/features/',
    '/guide/account': '/bilidanmu/docs/guide/account/',
    '/guide/room': '/bilidanmu/docs/guide/room/',
    '/guide/danmaku': '/bilidanmu/docs/guide/danmaku/',
    '/guide/auto': '/bilidanmu/docs/guide/auto/',
    '/guide/live': '/bilidanmu/docs/guide/live/',
    '/guide/listen': '/bilidanmu/docs/guide/listen/',
    '/guide/stt': '/bilidanmu/docs/guide/stt/',
    '/guide/ai': '/bilidanmu/docs/guide/ai/',
    '/guide/window': '/bilidanmu/docs/guide/window/',
    '/guide/template': '/bilidanmu/docs/guide/template/',
    '/guide/proxy': '/bilidanmu/docs/guide/proxy/',
    '/architecture/overview': '/bilidanmu/docs/architecture/overview/',
    '/architecture/structure': '/bilidanmu/docs/architecture/structure/',
    '/architecture/dataflow': '/bilidanmu/docs/architecture/dataflow/',
    '/architecture/frontend': '/bilidanmu/docs/architecture/frontend/',
    '/architecture/backend': '/bilidanmu/docs/architecture/backend/',
    '/api/bili': '/bilidanmu/docs/api/bili/',
    '/api/ipc': '/bilidanmu/docs/api/ipc/',
    '/api/events': '/bilidanmu/docs/api/events/',
    '/api/mcp': '/bilidanmu/docs/api/mcp/',
    '/research/notes': '/bilidanmu/docs/research/notes/',
    '/docs/quick-start': '/bilidanmu/docs/guide/quick-start/',
    '/docs/features': '/bilidanmu/docs/guide/features/',
  },

  // Prefetch links as they enter the viewport for snappier navigations
  // (works together with <ClientRouter />, which enables prefetch by default).
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },

  integrations: [
    sitemap(),
    starlight({
      title: 'BiliDanmu 文档',
      description: 'BiliDanmu 桌面弹幕伴侣的使用文档。',
      locales: {
        root: { label: '简体中文', lang: 'zh-CN' },
      },
      sidebar: [
        {
          label: '快速开始',
          items: [
            { label: '快速开始', link: 'docs/guide/quick-start/' },
            { label: '首次启动', link: 'docs/guide/start/' },
            { label: '安装与更新', link: 'docs/guide/install/' },
            { label: '功能总览', link: 'docs/guide/features/' },
          ],
        },
        {
          label: '核心功能',
          items: [
            { label: '账号', link: 'docs/guide/account/' },
            { label: '直播间', link: 'docs/guide/room/' },
            { label: '弹幕收发', link: 'docs/guide/danmaku/' },
            { label: '自动发送', link: 'docs/guide/auto/' },
            { label: '直播音频', link: 'docs/guide/live/' },
            { label: '听视频', link: 'docs/guide/listen/' },
            { label: '语音转字幕', link: 'docs/guide/stt/' },
            { label: 'AI 接入', link: 'docs/guide/ai/' },
            { label: '窗口', link: 'docs/guide/window/' },
            { label: '消息模板', link: 'docs/guide/template/' },
            { label: '网络代理', link: 'docs/guide/proxy/' },
          ],
        },
        {
          label: '技术架构',
          items: [
            { label: '架构总览', link: 'docs/architecture/overview/' },
            { label: '项目结构', link: 'docs/architecture/structure/' },
            { label: '数据流', link: 'docs/architecture/dataflow/' },
            { label: '前端', link: 'docs/architecture/frontend/' },
            { label: '后端', link: 'docs/architecture/backend/' },
          ],
        },
        {
          label: 'API 参考',
          items: [
            { label: 'B 站接口', link: 'docs/api/bili/' },
            { label: 'IPC 命令', link: 'docs/api/ipc/' },
            { label: '事件', link: 'docs/api/events/' },
            { label: 'MCP', link: 'docs/api/mcp/' },
          ],
        },
        {
          label: '技术调研',
          collapsed: true,
          items: [{ label: '技术调研笔记', link: 'docs/research/notes/' }],
        },
        { label: '常见问题', link: 'docs/faq/' },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/sfqy211/bilidanmu' },
      ],
      customCss: ['./src/assets/styles/starlight.css'],
      components: {
        SiteTitle: './src/components/starlight/SiteTitle.astro',
      },
      disable404Route: true,
      credits: false,
    }),
    mermaid({
      theme: 'neutral',
      autoTheme: true,
    }),
    mdx(),
    icon({
      // Local SVG icons (used as <Icon name="file-name" />) live next to the other assets.
      iconDir: 'src/assets/icons',
      include: {
        tabler: ['*'],
        'flat-color-icons': [
          'template',
          'gallery',
          'approval',
          'document',
          'advertising',
          'currency-exchange',
          'voice-presentation',
          'business-contact',
          'database',
        ],
      },
    }),

    ...whenExternalScripts(() =>
      partytown({
        config: { forward: ['dataLayer.push'] },
      })
    ),

    compress({
      // csso off on purpose: its parser doesn't understand the media range
      // syntax Tailwind v4 emits for breakpoints (`@media (width>=48rem)`) and
      // silently drops every one of those blocks — the site then renders as if
      // all `md:`/`lg:` classes were missing. lightningcss parses it correctly.
      CSS: { csso: false, lightningcss: { minify: true } },
      HTML: {
        'html-minifier-terser': {
          removeAttributeQuotes: false,
        },
      },
      Image: false,
      JavaScript: true,
      SVG: false,
      Logger: 1,
    }),

    astrowind({
      config: './src/config.yaml',
    }),
  ],

  image: {
    // Astro's default Sharp service handles local images.
    //
    // Most remote CDN images (Unsplash, Cloudinary, Imgix…) are routed by
    // src/components/common/Image.astro through `unpic`, which rewrites the
    // URL with CDN-side query parameters and serves it straight from the
    // provider — Astro never downloads it, so they don't need to be listed.
    //
    // `domains` only matters for remote URLs that fall through to Astro's
    // native <Image /> (i.e. providers Unpic can't detect, like Pixabay).
    // Listed entries are authorized to be processed by Sharp.
    // Unsplash is listed so post covers can be rendered as real 1200×626 Open Graph images.
    domains: ['cdn.pixabay.com', 'images.unsplash.com'],

    // Emit responsive styles for the native <Image layout=…> used by
    // src/components/common/Image.astro (local images). Utility classes on
    // each usage still win, since these styles use low-specificity selectors.
    responsiveStyles: true,
  },

  markdown: {
    processor: unified({
      remarkPlugins: [readingTimeRemarkPlugin],
      rehypePlugins: [responsiveTablesRehypePlugin],
    }),
    shikiConfig: {
      // Code blocks follow the site theme; see the `.astro-code` rules in tailwind.css.
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },

  vite: {
    plugins: [tailwindcss()],
    // 仓库根目录还有主应用用的 Tailwind 3 PostCSS 配置；这里显式清空，
    // 避免 Astro 向上查找时把 v3 插件套到本项目的 Tailwind 4 样式上。
    css: {
      postcss: { plugins: [] },
    },
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
  },
});
