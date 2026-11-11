import { useRef } from "react";
import type { CSSProperties } from "react";
import { createAsset } from "../links";
import { useScrollProgress } from "../useScrollProgress";
import "../../../css/landing-listen.css";

const scenes = [
  {
    key: "favorites",
    label: "收藏夹",
    title: ["收藏夹，", "也是歌单。"],
    description: "收藏夹、稍后再看和搜索结果，接着听就好。",
    file: "listen-fav-current.png",
    alt: "BiliDanmu 听视频收藏夹，保留视频封面并列出可播放的视频",
  },
  {
    key: "subtitles",
    label: "同步字幕",
    title: ["喜欢的声音，", "慢慢听。"],
    description: "纯音频播放，视频已有的字幕逐句跟随。",
    file: "player-current.png",
    alt: "BiliDanmu 音频播放器，显示视频标题、同步字幕、进度和播放控制",
  },
  {
    key: "mini",
    label: "迷你播放条",
    title: ["换个页面，", "声音继续。"],
    description: "底部播放条留在身边，随时暂停、切曲。",
    file: "listen-mini-current.png",
    alt: "BiliDanmu 主窗口底部的迷你播放条，离开播放器后仍可继续收听",
  },
];

export function ListenDemo({ assetBase }: { assetBase: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const progress = useScrollProgress(sectionRef);
  const current = Math.min(
    scenes.length - 1,
    Math.floor(progress * scenes.length),
  );
  const scene = scenes[current];
  const asset = createAsset(assetBase);

  return (
    <section
      id="listen"
      ref={sectionRef}
      className="listen-tour"
      aria-label="听视频滚动演示"
      data-scene={scene.key}
      style={{ "--listen-progress": progress } as CSSProperties}
    >
      <div className="listen-tour-sticky">
        <div className="listen-tour-layout">
          <div className="listen-tour-copy">
            <p className="listen-tour-label">还有，听视频。</p>
            <h2>
              {scene.title.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
            <p className="listen-tour-description">{scene.description}</p>
            <ol className="listen-tour-steps" aria-label="听视频演示进度">
              {scenes.map((item, index) => (
                <li
                  key={item.key}
                  className={index === current ? "is-current" : undefined}
                  aria-current={index === current ? "step" : undefined}
                >
                  <span className="listen-tour-step-mark" aria-hidden="true" />
                  {item.label}
                </li>
              ))}
            </ol>
          </div>

          <figure className="listen-tour-preview">
            <div className="listen-tour-screen">
              {scenes.map((item, index) => (
                <img
                  key={item.key}
                  src={asset(item.file)}
                  width={1200}
                  height={760}
                  alt={item.alt}
                  aria-hidden={index !== current}
                  className={index === current ? "is-current" : undefined}
                  loading="lazy"
                  decoding="async"
                />
              ))}
            </div>
            <figcaption>
              <span>BiliDanmu · 听视频</span>
              <span>
                继续向下滚动 <span aria-hidden="true">↓</span>
              </span>
            </figcaption>
          </figure>
        </div>
        <div className="listen-tour-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </section>
  );
}
