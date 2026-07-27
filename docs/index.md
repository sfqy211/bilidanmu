---
layout: home
hero:
  name: 'BiliDanmu'
  text: 'B 站直播间弹幕客户端'
  tagline: 基于 Tauri 2 + React 18 构建的 Windows 桌面端弹幕工具，轻量、强大、为直播而生。
  image:
    src: /icon.png
    alt: BiliDanmu
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/start
    - theme: alt
      text: 功能总览
      link: /guide/features
    - theme: alt
      text: 下载发布版
      link: https://github.com/sfqy211/bilidanmu/releases

features:
  - icon: 💬
    title: 实时弹幕收发
    details: WebSocket 长连接实时接收弹幕、礼物、进场、醒目留言、上舰，支持文字与表情弹幕发送。
  - icon: 👥
    title: 多账号管理
    details: TV 二维码登录，启动自动恢复，弹幕窗口内快速切换发送账号，支持匿名账号。
  - icon: 🔍
    title: 智能房间搜索
    details: 支持主播名、房间号、链接、UID 搜索，本地 SQLite 持久化历史记录。
  - icon: 🤖
    title: 自动发送与点赞
    details: 文字/表情两 Tab 自动发送，批量自动点赞，可调间隔与时间限制。
  - icon: 🎬
    title: 直播播放
    details: 实时直播音频流播放，v2 API + 本地代理绕过 CORS，mpegts.js FLV 播放。
  - icon: 🎙️
    title: 语音转字幕
    details: sherpa-onnx 流式识别，字幕叠加层实时显示，本地推理无需联网。
  - icon: 🧠
    title: AI 助手
    details: 对接 AstrBot，多条回复选项、自定义输入、自动总结、记忆学习。
  - icon: 🪟
    title: 桌面原生体验
    details: 系统托盘常驻、窗口 Dock 折叠、透明度调节、透传模式、自定义标题栏。
---

## 项目链接

<div class="link-cards">
  <a class="link-card" href="https://github.com/sfqy211/bilidanmu" target="_blank" rel="noopener">
    <strong>GitHub 仓库</strong>
    <span>查看源代码、提交 PR</span>
  </a>
  <a class="link-card" href="https://github.com/sfqy211/bilidanmu/releases" target="_blank" rel="noopener">
    <strong>下载发布版</strong>
    <span>获取最新 Windows 安装包（.msi / .nsis）</span>
  </a>
  <a class="link-card" href="https://github.com/sfqy211/bilidanmu/issues" target="_blank" rel="noopener">
    <strong>反馈 Issue</strong>
    <span>报告问题或提出建议</span>
  </a>
</div>

<div style="text-align: center; padding: 2rem 0 1rem; color: var(--vp-c-text-3); font-size: 0.9rem;">
  <p>轻量 · 开源 · 为 B 站直播而生</p>
</div>

<style scoped>
.link-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin: 24px 0;
}
.link-card {
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  text-decoration: none !important;
  transition: all 0.2s ease;
}
.link-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 174, 236, 0.12);
}
.link-card strong {
  color: var(--vp-c-brand-1);
  font-size: 15px;
  margin-bottom: 4px;
}
.link-card span {
  color: var(--vp-c-text-2);
  font-size: 13px;
}
</style>
