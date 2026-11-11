import { useRef, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  Check,
  ChevronDown,
  MousePointer2,
  MousePointerClick,
  Volume2,
} from "lucide-react";
import { DanmakuPreview, ramp } from "./DanmakuPreview";
import { useScrollProgress } from "../useScrollProgress";
import { DEFAULT_PRICE_COLORS } from "@/lib/price-chip";

const scenes = [
  {
    key: "welcome",
    label: "桌面弹幕",
    title: ["桌面归你，", "热闹在旁。"],
    text: "把 B 站直播留在桌面一角，手上的事照常。",
    detail: "向下滚动，开始演示",
  },
  {
    key: "opacity",
    label: "背景透明度",
    title: ["看见弹幕，", "也看见工作。"],
    text: "背景从 100% 渐变到 28%，消息始终清晰。",
    detail: "背景透明度 · 10–100%",
  },
  {
    key: "dock",
    label: "贴边收纳",
    title: ["靠边，收起。", "靠近，回来。"],
    text: "移开鼠标收成一条窄边，靠近后展开。",
    detail: "支持左侧、右侧与顶部吸附",
  },
  {
    key: "pass",
    label: "窗口透传",
    title: ["弹幕在眼前，", "点击落在下面。"],
    text: "继续编辑背后的文档，顶栏与输入框仍可操作。",
    detail: "消息区域透传 · 操作区域保留",
  },
  {
    key: "input",
    label: "仅输入框",
    title: ["想说一句？", "留这一行就够。"],
    text: "窗口缩成 48px 高的输入栏，随时发弹幕、选表情。",
    detail: "底边固定 · 一步恢复完整窗口",
  },
  {
    key: "messages",
    label: "消息与筛选",
    title: ["热闹有条理，", "视线更清净。"],
    text: "礼物、弹幕、活动分区显示，屏蔽关键词与用户。",
    detail: "分区高度可调 · 礼物按电池数筛选",
  },
  {
    key: "send",
    label: "快捷互动",
    title: ["熟悉的话，", "随时接上。"],
    text: "快捷消息、表情、循环发送和自动点赞，都在手边。",
    detail: "多账号可切换 · 互动功能需登录",
  },
  {
    key: "audio",
    label: "直播音频与字幕",
    title: ["听着直播，", "偶尔看一眼。"],
    text: "纯音频播放，本地语音识别把直播声音变成字幕。",
    detail: "开启语音识别后显示实时字幕",
  },
  {
    key: "rooms",
    label: "房间切换",
    title: ["换个直播间，", "还在这个窗口。"],
    text: "已保存且正在直播的房间，直接原地切换。",
    detail: "置顶、位置与窗口状态保持",
  },
  {
    key: "stealth",
    label: "鼠标移开隐身",
    title: ["需要安静时，", "轻轻退到幕后。"],
    text: "鼠标离开，窗口自动隐身。回来时，消息重新显现。",
    detail: "隐身期间整窗透传 · 连接保持",
  },
  {
    key: "tray",
    label: "隐藏到托盘",
    title: ["暂时收起来，", "直播也不断。"],
    text: "隐藏窗口后继续连接，托盘或全局快捷键随时唤回。",
    detail: "退出直播间，才会断开连接",
  },
  {
    key: "theme",
    label: "外观自定义",
    title: ["白天与夜晚，", "都有舒服的样子。"],
    text: "深浅主题、强调色、字体与字号，按你的习惯来。",
    detail: "浅色与深色分别保存 · 支持跟随系统",
  },
] as const;

export function DeskDemo() {
  const section = useRef<HTMLElement>(null);
  const progress = useScrollProgress(section);
  const position = progress * scenes.length;
  const index = Math.min(scenes.length - 1, Math.floor(position));
  const local = Math.min(1, position - index);
  const scene = scenes[index];
  const key = scene.key;

  const opacityFade = ramp(local, 0.08, 0.6) * (1 - ramp(local, 0.82, 1));
  const passFade = ramp(local, 0, 0.16) * (1 - ramp(local, 0.84, 1));
  const alpha =
    key === "opacity"
      ? 1 - opacityFade * 0.72
      : key === "pass"
        ? 1 - passFade * 0.72
        : 1;
  const dockAmount =
    key === "dock" ? ramp(local, 0.08, 0.3) * (1 - ramp(local, 0.66, 0.87)) : 0;
  const inputAmount =
    key === "input" ? ramp(local, 0.05, 0.3) * (1 - ramp(local, 0.82, 1)) : 0;
  const stealthAmount =
    key === "stealth"
      ? ramp(local, 0.06, 0.3) * (1 - ramp(local, 0.66, 0.88))
      : 0;
  const trayAmount =
    key === "tray" ? ramp(local, 0.1, 0.25) * (1 - ramp(local, 0.75, 0.95)) : 0;
  const dark = key === "theme" && local > 0.35;
  const switched = index > 8 || (key === "rooms" && local > 0.65);
  const opacity = Math.round(alpha * 100);
  const style = {
    "--window-alpha": alpha,
    "--dock-shift": `${dockAmount * 112}%`,
    "--dock-visible": dockAmount,
    "--window-visible": 1 - Math.max(stealthAmount, trayAmount),
    "--input-collapse": inputAmount,
    "--app-amount-accent": DEFAULT_PRICE_COLORS.scTier1,
    "--app-captain-accent": DEFAULT_PRICE_COLORS.guardCaptain,
    "--gift-share":
      key === "messages"
        ? 0.32 + ramp(local, 0.06, 0.25) * 0.16 - ramp(local, 0.32, 0.46) * 0.16
        : 0.32,
  } as CSSProperties;

  return (
    <section
      id="desk"
      className="tour"
      ref={section}
      aria-label="滚动浏览弹幕窗口功能"
    >
      <h1 className="lp-sr-only">BiliDanmu，桌面归你，热闹在旁。</h1>
      <div className="tour-sticky lp-shell">
        <div className="tour-layout">
          <div className="tour-copy">
            <p className="lp-eyebrow">
              <span className="lp-live-dot" />B 站桌面直播伴侣
            </p>
            <div className="tour-caption" key={scene.key}>
              <p className="tour-scene-label">{scene.label}</p>
              <h2>
                {scene.title[0]}
                <br />
                <em>{scene.title[1]}</em>
              </h2>
              <p className="tour-description">{scene.text}</p>
              <p className="tour-detail">{scene.detail}</p>
            </div>
            {index === 0 ? (
              <div className="tour-intro-actions">
                <a className="lp-button" href="#download">
                  下载 BiliDanmu <ArrowDownToLine size={16} />
                </a>
                <span>Windows · macOS · Linux</span>
              </div>
            ) : (
              <p className="tour-continue">
                <ArrowDown size={15} />
                继续滚动，接着体验
              </p>
            )}
          </div>

          <div className="tour-visual">
            <div
              className="tour-desktop"
              data-scene={key}
              data-dark={dark}
              style={style}
              role="img"
              aria-label={`${scene.label}演示。${scene.text}`}
            >
              <div className="tour-desktop-content" aria-hidden="true">
                <div className="tour-desktop-top">
                  <span>我的工作区</span>
                  <span>周五 · 16:32</span>
                </div>
                <WorkDocument selected={key === "pass" && local > 0.3} />
                <DanmakuPreview
                  scene={key}
                  local={local}
                  switched={switched}
                  opacity={opacity}
                  dark={dark}
                />

                <div className="tour-dock-bar">
                  <i />
                </div>
                <DemoCursor scene={key} local={local} />
                <div className="tour-desktop-bottom">
                  <span className="tour-app-dot">B</span>
                  <span>文档已保存</span>
                  <span className="tour-tray">
                    <Volume2 size={12} />
                    <span className="tour-tray-logo">B</span>
                    <ChevronDown size={12} />
                  </span>
                </div>
                {key === "pass" && (
                  <div className="tour-state-note">
                    <MousePointerClick size={13} />
                    正在编辑下层文档
                  </div>
                )}
                {key === "audio" && (
                  <div className="tour-state-note">
                    <Volume2 size={13} />
                    直播音频 · 本地识别中
                  </div>
                )}
                {key === "dock" && (
                  <div className="tour-state-note">
                    {dockAmount > 0.8
                      ? "已收起 · 鼠标靠近展开"
                      : "移到边缘，自动收纳"}
                  </div>
                )}
                {key === "tray" && (
                  <div className="tour-state-note">
                    <span className="lp-live-dot" />
                    {trayAmount > 0.8
                      ? "已隐藏到托盘 · 直播连接保持"
                      : "从托盘唤回弹幕窗口"}
                  </div>
                )}
              </div>
            </div>
            <div className="tour-visual-caption">
              <span>界面演示 · 示例消息</span>
              <span>
                {key === "opacity" ? `背景透明度 ${opacity}%` : scene.label}
              </span>
            </div>
          </div>
        </div>

        <div className="tour-timeline" aria-hidden="true">
          {scenes.map((item, itemIndex) => (
            <div
              key={item.key}
              className={itemIndex === index ? "is-current" : undefined}
            >
              <span>
                <i
                  style={{
                    transform: `scaleX(${itemIndex < index ? 1 : itemIndex === index ? local : 0})`,
                  }}
                />
              </span>
              <small>{item.label}</small>
            </div>
          ))}
        </div>
        <div className="tour-scroll-hint">
          <ArrowDown size={14} />
          <span>滚动探索</span>
          <span>
            {String(index + 1).padStart(2, "0")} / {scenes.length}
          </span>
        </div>
      </div>
      <ol className="lp-sr-only">
        {scenes.map((item) => (
          <li key={item.key}>
            <h2>{item.label}</h2>
            <p>
              {item.text} {item.detail}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WorkDocument({ selected }: { selected: boolean }) {
  return (
    <div className="tour-work-document">
      <div className="tour-document-chrome">
        <span className="tour-document-dots">
          <i />
          <i />
          <i />
        </span>
        <span>本周工作计划</span>
        <span>自动保存</span>
      </div>
      <div className="tour-document-toolbar">
        <span>文件</span>
        <span>编辑</span>
        <span>插入</span>
        <span>视图</span>
        <span>帮助</span>
      </div>
      <div className="tour-document-page">
        <p className="tour-document-path">工作空间 / 项目记录</p>
        <h3>把事情，一件件做好。</h3>
        <p>本周进度与下周安排</p>
        <div className="tour-document-rule" />
        <div className="tour-task">
          <Check size={13} />
          <span>整理本周的项目进度</span>
          <small>已完成</small>
        </div>
        <div className={`tour-task${selected ? " is-selected" : ""}`}>
          <Check size={13} />
          <span>更新产品设计文档</span>
          <small>{selected ? "编辑中" : "进行中"}</small>
          {selected && (
            <span className="tour-document-cursor">
              <MousePointer2 size={24} fill="currentColor" />
            </span>
          )}
        </div>
        <div className="tour-task">
          <span className="tour-task-check" />
          <span>准备下周的工作安排</span>
          <small>待开始</small>
        </div>
        <h4>一些新的想法</h4>
        <p className="tour-document-paragraph">
          把注意力留给眼前的事情。
          <br />
          也给喜欢的声音，留一点空间。
        </p>
        <div className="tour-document-lines">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}

function DemoCursor({ scene, local }: { scene: string; local: number }) {
  let x = 82;
  let y = 76;
  if (scene === "dock") {
    const approach = ramp(local, 0.45, 0.66);
    x = 30 + approach * 68;
    y = 50;
  } else if (scene === "pass") {
    x = 70 - ramp(local, 0.05, 0.4) * 20;
    y = 45;
  } else if (scene === "stealth") {
    x = 75 - ramp(local, 0.06, 0.3) * 50 + ramp(local, 0.55, 0.67) * 50;
    y = 30;
  } else if (scene === "rooms") {
    x = 80;
    y = 19 + ramp(local, 0.2, 0.4) * 12;
  } else if (scene === "tray") {
    x = 93;
    y = local < 0.4 ? 9 : 97;
  }
  const shown = ["dock", "stealth", "tray", "rooms", "send", "input"].includes(
    scene,
  );
  return (
    <div
      className={`tour-cursor${shown ? " is-visible" : ""}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <MousePointer2 size={24} fill="currentColor" />
      <span>{scene === "pass" ? "文档" : ""}</span>
    </div>
  );
}
