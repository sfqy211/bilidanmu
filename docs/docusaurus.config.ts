import path from 'node:path';
import { themes as prismThemes } from 'prism-react-renderer';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import type { Config, Plugin } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const REPO_URL = 'https://github.com/sfqy211/bilidanmu';
const SITE_URL = 'https://sfqy211.github.io';
const BASE = '/bilidanmu/';

// Tailwind 只服务首页。Docusaurus 默认不读取 postcss.config.js，
// 这里把插件注入它自己的 PostCSS 管线。
function tailwindPlugin(): Plugin {
  return {
    name: 'bilidanmu-tailwindcss',
    configurePostCss(postcssOptions) {
      postcssOptions.plugins.push(tailwindcss, autoprefixer);
      return postcssOptions;
    },
  };
}

// 首页复用 App 源码里的金额档位配置，@ 别名指向应用根目录。
function appAliasPlugin(): Plugin {
  return {
    name: 'bilidanmu-app-alias',
    configureWebpack() {
      return {
        resolve: {
          alias: {
            '@': path.resolve(__dirname, '../src'),
          },
        },
      };
    },
  };
}

const config: Config = {
  title: 'BiliDanmu',
  tagline: '把热闹，轻轻放在身边。',
  url: SITE_URL,
  baseUrl: BASE,
  trailingSlash: false,
  organizationName: 'sfqy211',
  projectName: 'bilidanmu',
  favicon: 'favicon.svg',
  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },
  onBrokenLinks: 'throw',
    onBrokenAnchors: 'warn',
  markdown: {
    format: 'detect',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['zh'],
        docsRouteBasePath: '/',
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 8,
        searchBarShortcutHint: true,
      },
    ],
  ],
  plugins: [tailwindPlugin, appAliasPlugin],
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          showLastUpdateTime: true,
          editUrl: `${REPO_URL}/edit/main/docs/docs/`,
        },
        blog: false,
        pages: {
          path: 'src/pages',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    image: 'marketing/cover-0.svg',
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'BiliDanmu',
      logo: {
        alt: 'BiliDanmu',
        src: 'logo.svg',
        width: 28,
        height: 28,
      },
      items: [
        {
          to: '/',
          label: '首页',
          position: 'left',
          activeBaseRegex: '^/$',
        },
        {
          to: '/guide/quick-start',
          label: '用户指南',
          position: 'left',
        },
        {
          to: '/architecture/overview',
          label: '技术架构',
          position: 'left',
        },
        {
          to: '/api/bili',
          label: 'API 参考',
          position: 'left',
        },
        {
          type: 'dropdown',
          label: '更多',
          position: 'left',
          items: [
            {
              label: '下载软件',
              href: `${REPO_URL}/releases/latest`,
            },
            {
              label: '技术调研',
              to: '/research/notes',
            },
            {
              label: 'GitHub',
              href: REPO_URL,
            },
          ],
        },
        {
          type: 'search',
          position: 'right',
        },
        {
          href: REPO_URL,
          position: 'right',
          className: 'navbar-github-link',
          'aria-label': 'GitHub 仓库',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: '文档',
          items: [
            { label: '快速上手', to: '/guide/quick-start' },
            { label: '技术架构', to: '/architecture/overview' },
            { label: 'API 参考', to: '/api/bili' },
          ],
        },
        {
          title: '项目',
          items: [
            { label: '下载软件', href: `${REPO_URL}/releases/latest` },
            { label: 'GitHub', href: REPO_URL },
            { label: '问题反馈', href: `${REPO_URL}/issues` },
          ],
        },
      ],
      copyright: `Copyright © 2024 BiliDanmu · 基于 GNU AGPL v3.0 开源`,
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: false,
      },
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 3,
    },
    mermaid: {
      theme: {
        light: 'neutral',
        dark: 'dark',
      },
    },
    prism: {
      theme: prismThemes.oneDark,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ['bash', 'json', 'powershell', 'rust', 'toml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
