export const railItems = [
  "透明弹幕窗",
  "点击穿透",
  "贴边收起",
  "三栏消息",
  "关键词屏蔽",
  "收藏夹连播",
  "字幕跟随",
  "多账号",
];

export interface LiveTab {
  label: string;
  file: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
}

export const liveTabs: LiveTab[] = [
  {
    label: "三栏消息",
    file: "danmaku-content.webp",
    width: 1040,
    height: 1520,
    alt: "BiliDanmu 弹幕窗口：礼物、弹幕与活动三栏消息",
    caption: "礼物 / 弹幕 / 活动，各就各位。",
  },
  {
    label: "筛选与显示",
    file: "danmaku-settings-panel.webp",
    width: 1040,
    height: 1520,
    alt: "BiliDanmu 弹幕显示与筛选设置面板",
    caption: "屏蔽关键词、用户与礼物类型，只留下想看的。",
  },
];

export const features = [
  { title: "扫码登录", desc: "B 站 TV 端二维码授权，多账号随时切换。" },
  { title: "房间管理", desc: "关注、搜索、拖动排序，直播中的房间排在前面。" },
  { title: "表情与快捷消息", desc: "常用表情收藏，消息模板一键填入发送栏。" },
  { title: "自动点赞", desc: "目标总数、每批数量与间隔可调，随时停止。" },
  { title: "视频原有字幕", desc: "逐句高亮、点击跳转，也可以切到专注字幕视图。" },
  { title: "自动重连", desc: "多服务器优选，断线后按间隔自动重连。" },
  { title: "托盘与快捷键", desc: "单击托盘显示或隐藏，全局快捷键可自定义。" },
  { title: "本地保存", desc: "设置、房间、模板与收藏都留在本机。" },
];

export const listenSteps = [
  {
    key: "fav",
    label: "从收藏夹开始",
    short: "收藏夹 / 稍后再看 / 搜索",
    file: "listen-fav.webp",
    width: 2400,
    height: 1520,
    alt: "BiliDanmu 收藏夹页面，选择视频开始收听",
    note: "收藏夹、稍后再看和搜索结果，都能直接变成播放队列。",
  },
  {
    key: "player",
    label: "把视频当音乐听",
    short: "播放 / 切曲 / 进度",
    file: "player-start.webp",
    width: 2400,
    height: 1520,
    alt: "BiliDanmu 播放器，显示封面、字幕与播放控制",
    note: "播放、切曲、进度和音量都在主界面；有字幕时还能逐句跟随。",
  },
  {
    key: "mini",
    label: "离开页面，继续听",
    short: "底部小播放条",
    file: "listen-mini.webp",
    width: 2400,
    height: 1520,
    alt: "BiliDanmu 主窗口底部的迷你播放条",
    note: "去逛别的页面，声音继续；底部小播放条随时暂停、切曲或回到播放器。",
  },
];

export const listenLines = [
  { time: "00:38", text: "把喜欢的声音，放在身边。" },
  { time: "01:02", text: "不必一直看着屏幕，也能好好享受。" },
  { time: "01:30", text: "每一次聆听，都是一次新的出发。" },
];

export const accents = [
  { name: "信号粉", value: "#f2547d" },
  { name: "弹幕蓝", value: "#4fb8f0" },
  { name: "薄荷绿", value: "#73ddbd" },
];

export const previewRooms = [
  { name: "夜航电台", desc: "今晚，让音乐陪你久一点" },
  { name: "木木的工作室", desc: "把灵感慢慢变成作品" },
  { name: "晴天音乐盒", desc: "刚刚好的旋律" },
];

export const deskModes = [
  { key: "opacity", label: "透明", hint: "背景越透明，后面的工作越清楚；文字和按钮始终清晰。" },
  { key: "dock", label: "贴边", hint: "收起后只留一条窄边；鼠标靠近，窗口回来。" },
  { key: "pass", label: "穿透", hint: "只让空白处穿透，按钮、输入框和菜单照常可用。" },
] as const;

export type DeskMode = (typeof deskModes)[number]["key"];
