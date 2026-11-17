import type { ReactNode } from "react";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import { CoverCardInfo } from "@/components/CoverCardInfo";
import "./CoverCard.css";

/**
 * 封面卡公共组件（看直播页与听视频页共用）：
 * - 封面区：`cover`（图）或 `placeholder`（无图占位）
 * - 图上浮层：`badges` 放右上角状态徽标，`duration` 放左下角时长
 * - 右下角操作按钮：`actions` 槽位（悬停浮现，样式用 `.cover-card-button`）
 * - 封面下方信息区：默认用 `CoverCardInfo`（头像 + 标题 + 名称），
 *   也可以用 `info` 整块替换做二次定制
 *
 * 根节点会把透传的 props（role / tabIndex / onClick / onMouseDown / data-* 等）
 * 原样挂上，消费方据此实现"点击播放 / 拖动排序"等自己的交互。
 */
export function CoverCard({
  cover,
  coverAlt = "",
  placeholder,
  badges,
  duration,
  actions,
  avatar,
  name,
  title,
  titleFallback,
  showAvatar = true,
  info,
  current = false,
  busy = false,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  cover?: string;
  coverAlt?: string;
  /** 无封面时的占位内容 */
  placeholder?: ReactNode;
  /** 图上角标（右上角） */
  badges?: ReactNode;
  /** 左下角时长徽标 */
  duration?: string;
  /** 右下角操作按钮（悬停出现） */
  actions?: ReactNode;
  /** 下方信息区：头像 */
  avatar?: string | null;
  /** 下方信息区：主播 / UP 主名称 */
  name: string;
  /** 下方信息区：标题（直播标题 / 视频标题） */
  title?: string;
  titleFallback?: string;
  showAvatar?: boolean;
  /** 整块替换默认信息区（二次定制） */
  info?: ReactNode;
  /** 当前选中 / 正在播放 */
  current?: boolean;
  /** 忙碌态（加载中 / 不可操作） */
  busy?: boolean;
}) {
  return (
    <div className={`cover-card group ${current ? "is-current" : ""} ${busy ? "is-busy" : ""} ${className}`} {...rest}>
      <div className="cover-card-image">
        {cover ? (
          <ProxiedImage src={cover} alt={coverAlt} persistent className="h-full w-full object-cover" />
        ) : (
          <div className="cover-card-placeholder">{placeholder}</div>
        )}
        {badges && <div className="cover-card-badges">{badges}</div>}
        {duration && <span className="numeric cover-card-duration">{duration}</span>}
        {actions && <div className="cover-card-actions">{actions}</div>}
      </div>
      {info ?? (
        <CoverCardInfo
          avatar={avatar}
          name={name}
          title={title}
          titleFallback={titleFallback}
          showAvatar={showAvatar}
        />
      )}
    </div>
  );
}
