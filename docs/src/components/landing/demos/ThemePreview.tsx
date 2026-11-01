import { useState } from "react";
import type { CSSProperties } from "react";
import { accents, previewRooms } from "../data";
import { createAsset } from "../links";

export function ThemePreview({ assetBase }: { assetBase: string }) {
  const asset = createAsset(assetBase);
  const [dark, setDark] = useState(false);
  const [accent, setAccent] = useState("#f2547d");

  return (
    <div
      className={`theme-preview${dark ? " is-dark" : ""}`}
      style={{ "--preview-accent": accent } as CSSProperties}
    >
      <div className="theme-toolbar">
        <div className="theme-toggle" role="group" aria-label="选择明暗模式">
          <button type="button" aria-pressed={!dark} onClick={() => setDark(false)}>
            浅色
          </button>
          <button type="button" aria-pressed={dark} onClick={() => setDark(true)}>
            深色
          </button>
        </div>
        <div className="theme-swatches" role="group" aria-label="选择强调色">
          {accents.map((item) => (
            <button
              key={item.value}
              type="button"
              style={{ "--swatch": item.value } as CSSProperties}
              aria-label={item.name}
              aria-pressed={accent === item.value}
              onClick={() => setAccent(item.value)}
            >
              {accent === item.value ? <span aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="theme-app">
        <aside className="theme-side" aria-hidden="true">
          <img src={asset("logo.svg")} width={24} height={24} alt="" />
          <b>直播间</b>
          <span>听视频</span>
          <span>账号</span>
          <span>设置</span>
        </aside>

        <div className="theme-main">
          <div className="theme-head">
            <h3>常看的直播</h3>
            <span>3 个直播中</span>
          </div>
          {previewRooms.map((room, index) => (
            <div key={room.name} className="theme-room">
              <img src={asset(`cover-${index}.svg`)} width={52} height={34} alt="" />
              <div>
                <b>{room.name}</b>
                <small title={room.desc}>{room.desc}</small>
              </div>
              <span className="theme-live">直播中</span>
            </div>
          ))}
        </div>
      </div>

      <p className="theme-caption">界面示意 · 浅色 / 深色与强调色，保存后下次打开仍保留。</p>
    </div>
  );
}
