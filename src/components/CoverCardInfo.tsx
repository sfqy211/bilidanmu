import { useTranslation } from "@/i18n";
import { ProxiedImage } from "@/components/ui/ProxiedImage";
import "./CoverCardInfo.css";

/**
 * 封面卡信息区：头像 + 标题 + 名称。
 * 直播间的封面卡（主播头像 + 直播标题 + 主播名）与听视频的封面卡
 * （UP 主头像 + 视频标题 + UP 主名）共用同一布局：信息统一放在封面下方，
 * 头像在标题/名称的左侧。
 */
export function CoverCardInfo({ avatar, name, title, titleFallback, showAvatar = true }: {
  /** 头像 URL；为空或 showAvatar=false 时按名称首字占位/隐藏 */
  avatar?: string | null;
  /** 主播 / UP 主名称 */
  name: string;
  /** 直播标题 / 视频标题 */
  title?: string;
  titleFallback?: string;
  /** 全局「显示头像」设置关闭时不渲染头像 */
  showAvatar?: boolean;
}) {
  const { t } = useTranslation("desktop");
  const displayTitle = title || titleFallback || t("videoCollection.untitled");
  return (
    <div className="cover-info">
      {showAvatar && (avatar ? (
        <ProxiedImage src={avatar} alt={name} persistent className="cover-info-avatar" />
      ) : (
        <div className="cover-info-avatar cover-info-avatar-fallback" aria-hidden="true">
          {name.charAt(0)}
        </div>
      ))}
      <div className="cover-info-text">
        <p className="cover-info-title" title={displayTitle}>{displayTitle}</p>
        <p className="cover-info-name" title={name}>{name}</p>
      </div>
    </div>
  );
}
