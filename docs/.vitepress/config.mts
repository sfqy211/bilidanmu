import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-mermaid'

const REPO_URL = 'https://github.com/sfqy211/bilidanmu'

const config = defineConfig({
  title: 'BiliDanmu',
  description: 'Windows 桌面端 B 站直播间弹幕客户端，基于 Tauri 2 + React 18 构建。',
  lang: 'zh-CN',
  lastUpdated: true,
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#00aeec' }],
  ],
  markdown: {
    lineNumbers: true,
    container: {
      tipLabel: '提示',
      warningLabel: '注意',
      dangerLabel: '警告',
      infoLabel: '信息',
      detailsLabel: '详情',
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'BiliDanmu',
    nav: [
      { text: '首页', link: '/' },
      { text: '用户指南', link: '/guide/start' },
      { text: '技术架构', link: '/architecture/overview' },
      { text: 'API 参考', link: '/api/bili' },
      {
        text: '更多',
        items: [
          { text: '设计规范', link: '/design/overview' },
          { text: '技术调研', link: '/research/notes' },
          { text: 'GitHub', link: REPO_URL },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '快速开始',
          items: [
            { text: '项目介绍', link: '/guide/start' },
            { text: '安装与启动', link: '/guide/install' },
            { text: '功能总览', link: '/guide/features' },
          ],
        },
        {
          text: '核心功能',
          items: [
            { text: '账号与登录', link: '/guide/account' },
            { text: '房间搜索', link: '/guide/room' },
            { text: '弹幕收发', link: '/guide/danmaku' },
            { text: '自动发送与点赞', link: '/guide/auto' },
            { text: '直播播放', link: '/guide/live' },
            { text: '语音转字幕', link: '/guide/stt' },
            { text: 'AI 助手', link: '/guide/ai' },
            { text: '窗口与 Dock', link: '/guide/window' },
            { text: '消息模板', link: '/guide/template' },
            { text: '图片代理与缓存', link: '/guide/proxy' },
          ],
        },
      ],
      '/architecture/': [
        {
          text: '技术架构',
          items: [
            { text: '架构总览', link: '/architecture/overview' },
            { text: '项目结构', link: '/architecture/structure' },
            { text: '数据流设计', link: '/architecture/dataflow' },
            { text: '前端架构', link: '/architecture/frontend' },
            { text: '后端架构', link: '/architecture/backend' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: 'B 站 API', link: '/api/bili' },
            { text: 'IPC 命令', link: '/api/ipc' },
            { text: '事件列表', link: '/api/events' },
          ],
        },
      ],
      '/design/': [
        {
          text: '设计规范',
          items: [
            { text: '设计风格', link: '/design/overview' },
            { text: '页面布局', link: '/design/layout' },
          ],
        },
      ],
      '/research/': [
        {
          text: '技术调研',
          items: [
            { text: '调研笔记', link: '/research/notes' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: REPO_URL },
    ],
    outline: {
      level: [2, 3],
      label: '页面导航',
    },
    footer: {
      message: '基于 GNU Affero General Public License v3.0 开源',
      copyright: `Copyright © 2024 BiliDanmu · <a href="${REPO_URL}/issues">反馈 Issue</a>`,
    },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索' },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换' },
          },
        },
      },
    },
    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
    lastUpdated: { text: '最后更新于' },
  },
})

export default withMermaid(config)
