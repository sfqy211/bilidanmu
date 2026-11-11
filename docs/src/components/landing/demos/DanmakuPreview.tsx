import type { ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ClipboardList,
  Expand,
  Ghost,
  Gift,
  ListVideo,
  Lock,
  LogOut,
  MessageSquare,
  MousePointerClick,
  Pause,
  Pin,
  Play,
  Send,
  Settings,
  ShieldBan,
  Smile,
  TextCursorInput,
  ThumbsUp,
  Users,
  Volume2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

const chat = [
  { user: "小满", text: "今天也来陪大家一起工作", medal: "星河 12" },
  { user: "拾光", text: "这首好听，先收藏了", guard: true },
  { user: "不吃香菜", text: "一边整理文档一边听，刚刚好" },
  { user: "路过的广告", text: "广告推广请联系……", blocked: true },
  { user: "晚风", text: "窗外的天慢慢暗下来了", medal: "星河 18" },
  { user: "木木", text: "下班前的最后一点进度！" },
  { user: "橘子汽水", text: "好耶，今天也辛苦了" },
  { user: "星河", text: "慢慢来，我们都在" },
];

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function ramp(value: number, from: number, to: number) {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

function Icon({
  icon: Component,
  active = false,
}: {
  icon: LucideIcon;
  active?: boolean;
}) {
  return (
    <span className={`tour-icon${active ? " is-active" : ""}`}>
      <Component size={14} strokeWidth={1.7} />
    </span>
  );
}

function PanelHeading({ children }: { children: ReactNode }) {
  return (
    <div className="tour-panel-heading">
      <span>{children}</span>
      <X size={12} />
    </div>
  );
}

export function DanmakuPreview({
  scene,
  local,
  switched,
  opacity,
  dark,
}: {
  scene: string;
  local: number;
  switched: boolean;
  opacity: number;
  dark: boolean;
}) {
  const filtering = scene === "messages" && local > 0.48;
  const sent = scene === "send" && local > 0.47;
  const quickMessage = "这首好听，今天也辛苦啦！";
  const draft = quickMessage.slice(
    0,
    Math.round(ramp(local, 0.23, 0.44) * quickMessage.length),
  );

  return (
    <div className="tour-window-position">
      <div className={`tour-window${scene === "input" ? " is-input" : ""}`}>
        <div className="tour-full-window">
          <div className="tour-titlebar">
            <span className="tour-room-title">
              {switched
                ? "晴天音乐盒 - 分享一些喜欢的旋律"
                : "星河电台 - 今晚，让音乐陪你久一点"}
            </span>
            <Icon icon={Pin} />
            <Icon icon={Lock} />
            <Icon icon={TextCursorInput} active={scene === "input"} />
            <Icon icon={MousePointerClick} active={scene === "pass"} />
            <Icon icon={Ghost} active={scene === "stealth"} />
            <Icon icon={X} />
            <Icon icon={ListVideo} active={scene === "rooms"} />
            <Icon icon={LogOut} />
          </div>
          <div className="tour-audio-bar">
            <Icon
              icon={scene === "audio" ? Pause : Play}
              active={scene === "audio"}
            />
            <Icon icon={Volume2} />
            <span className="tour-stats">
              <MessageSquare size={11} />
              128
              <Gift size={11} />
              ¥229.0
              <Users size={11} />
              2.4k
            </span>
          </div>
          <PreviewMessages
            scene={scene}
            local={local}
            switched={switched}
            filtering={filtering}
            sent={sent}
          />
        </div>

        <div className="tour-input-bar">
          <div className="tour-input-tools">
            <Icon icon={Zap} active={scene === "send" && local > 0.72} />
            <Icon
              icon={Smile}
              active={scene === "send" && local > 0.56 && local < 0.72}
            />
            <span className="tour-account-letter">小</span>
            <Icon icon={ShieldBan} active={filtering} />
            <Icon
              icon={Settings}
              active={scene === "theme" || scene === "opacity"}
            />
            <Icon
              icon={ClipboardList}
              active={scene === "send" && local < 0.23}
            />
          </div>
          <div className="tour-input-field">
            <span>
              {scene === "send" && !sent && draft
                ? draft
                : scene === "input" && local > 0.35 && local < 0.8
                  ? "好听！"
                  : "请输入文字"}
            </span>
            <Icon icon={Send} active={scene === "send" || scene === "input"} />
            <span className="tour-compact-tools">
              <Icon icon={Smile} />
              <Icon icon={Expand} />
              <i />
            </span>
          </div>
        </div>

        <DemoPanels
          scene={scene}
          local={local}
          opacity={opacity}
          dark={dark}
          filtering={filtering}
        />
      </div>
    </div>
  );
}

function PreviewMessages({
  scene,
  local,
  switched,
  filtering,
  sent,
}: {
  scene: string;
  local: number;
  switched: boolean;
  filtering: boolean;
  sent: boolean;
}) {
  const displayedChat = sent ? chat.slice(-2) : chat;

  return (
    <div className="tour-message-area" data-filtering={filtering}>
      <div className="tour-gifts">
        <div className="tour-gift-filters">
          <span>送礼</span>
          <span>上舰</span>
          <span>醒目留言</span>
          <small>电池筛选</small>
        </div>
        <div className="tour-message">
          <b className="tour-price is-sc">¥30</b>
          <span className="tour-username">拾光</span>
          <span className="tour-sc-text">愿每个夜晚，都有好音乐相伴。</span>
        </div>
        <div className="tour-message">
          <b className="tour-price">¥1</b>
          <span className="tour-username">晚风</span>
          <strong className="tour-gift-name">小心心 × 10</strong>
        </div>
        <div className="tour-message">
          <b className="tour-price is-guard">¥198</b>
          <span className="tour-username is-guard">远山</span>
          <span className="tour-guard-name">舰长</span>
        </div>
      </div>
      <div className="tour-divider">
        <i />
      </div>
      <div className="tour-chat" data-sent={sent}>
        {displayedChat.map((message) => (
          <div
            key={message.user}
            className={`tour-message${message.blocked ? " tour-filtered-message" : ""}`}
          >
            {message.medal && (
              <span className="tour-medal">{message.medal}</span>
            )}
            <span
              className={`tour-username${message.guard ? " is-guard" : ""}`}
            >
              {message.user}
            </span>
            <span>
              {switched ? message.text.replace("工作", "听歌") : message.text}
            </span>
          </div>
        ))}
        {sent && (
          <div className="tour-message tour-sent-message">
            <span className="tour-self">我</span>
            <span>这首好听，今天也辛苦啦！</span>
          </div>
        )}
      </div>
      <div className="tour-divider">
        <i />
      </div>
      <div className="tour-activity">
        <div className="tour-activity-label">
          <span>全部</span>
          <small>进场</small>
          <small>点赞</small>
        </div>
        <div className="tour-message">
          <span className="tour-username">小岛</span>
          <span>关注了主播</span>
        </div>
        <div className="tour-message">
          <ThumbsUp size={11} />
          <span className="tour-username">一颗栗子</span>
          <span>为主播点赞</span>
        </div>
      </div>
      {scene === "audio" && (
        <div className="tour-subtitle">
          {local > 0.55
            ? "希望这首歌，能陪你度过今天的最后一点工作。"
            : "欢迎回来，今天也辛苦了。"}
        </div>
      )}
    </div>
  );
}

function DemoPanels({
  scene,
  local,
  opacity,
  dark,
  filtering,
}: {
  scene: string;
  local: number;
  opacity: number;
  dark: boolean;
  filtering: boolean;
}) {
  return (
    <>
      {scene === "opacity" && (
        <div className="tour-popover tour-opacity-panel">
          <PanelHeading>外观设置</PanelHeading>
          <div className="tour-opacity-label">
            <span>背景透明度</span>
            <strong>{opacity}%</strong>
          </div>
          <div className="tour-range">
            <i style={{ width: `${(opacity - 10) / 0.9}%` }} />
          </div>
        </div>
      )}
      {filtering && (
        <div className="tour-popover tour-filter-panel">
          <PanelHeading>屏蔽管理</PanelHeading>
          <div className="tour-panel-tabs">
            <b>屏蔽关键词</b>
            <span>屏蔽用户</span>
          </div>
          <div className="tour-keyword">
            广告推广 <X size={12} />
          </div>
          <p>
            <Check size={12} />
            关键词屏蔽已生效
          </p>
        </div>
      )}
      {scene === "send" && local < 0.23 && (
        <div className="tour-popover tour-quick-panel">
          <PanelHeading>快捷消息</PanelHeading>
          <div className="tour-template is-selected">
            这首好听，今天也辛苦啦！
          </div>
          <div className="tour-template">晚上好，来报到了</div>
          <div className="tour-template">下次直播见～</div>
        </div>
      )}
      {scene === "send" && local > 0.56 && local < 0.72 && (
        <div className="tour-popover tour-quick-panel">
          <PanelHeading>表情</PanelHeading>
          <div className="tour-panel-tabs">
            <b>收藏</b>
            <span>默认表情</span>
          </div>
          <div className="tour-emotes">
            <span>赞</span>
            <span>打 call</span>
            <span>比心</span>
            <span>干杯</span>
          </div>
        </div>
      )}
      {scene === "send" && local > 0.72 && (
        <div className="tour-popover tour-quick-panel">
          <PanelHeading>循环发送</PanelHeading>
          <div className="tour-panel-tabs">
            <span className={local < 0.86 ? "is-selected" : ""}>文字</span>
            <span>表情</span>
            <span className={local >= 0.86 ? "is-selected" : ""}>点赞</span>
          </div>
          <div className="tour-auto-entry">
            {local < 0.86 ? "这首好听，今天也辛苦啦！" : "目标点赞数 100"}
          </div>
          <p className="tour-auto-status">
            {local < 0.86
              ? "发送间隔 30 秒 · 循环中"
              : `已点赞 ${Math.round(ramp(local, 0.86, 1) * 100)} / 100`}
          </p>
        </div>
      )}
      {scene === "rooms" && local < 0.65 && (
        <div className="tour-popover tour-room-panel">
          <div className="tour-room-option">
            <span>
              <strong>星河电台</strong>
              <small>今晚，让音乐陪你久一点</small>
            </span>
            <Check size={13} />
          </div>
          <div
            className={`tour-room-option${local > 0.35 ? " is-selected" : ""}`}
          >
            <span>
              <strong>晴天音乐盒</strong>
              <small>分享一些喜欢的旋律</small>
            </span>
            <span className="lp-live-dot" />
          </div>
        </div>
      )}
      {scene === "theme" && (
        <div className="tour-popover tour-theme-panel">
          <PanelHeading>外观设置</PanelHeading>
          <div className="tour-setting-row">
            <span>主题</span>
            <strong>
              {dark ? "深色" : "浅色"}
              <ChevronDown size={11} />
            </strong>
          </div>
          <div className="tour-setting-row">
            <span>背景透明度</span>
            <span>100%</span>
          </div>
          <div className="tour-range">
            <i style={{ width: "100%" }} />
          </div>
          <div className="tour-setting-row">
            <span>字体大小</span>
            <span>14px</span>
          </div>
          <div className="tour-range">
            <i style={{ width: "18%" }} />
          </div>
        </div>
      )}
    </>
  );
}
