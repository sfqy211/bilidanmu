import { useState } from "react";
import { listenLines, listenSteps } from "../data";
import { createAsset } from "../links";

export function ListenDemo({ assetBase }: { assetBase: string }) {
  const asset = createAsset(assetBase);
  const [current, setCurrent] = useState(0);
  const [activeLine, setActiveLine] = useState(1);

  return (
    <div className="listen-demo">
      <div className="listen-steps" role="group" aria-label="选择听视频场景">
        {listenSteps.map((step, index) => (
          <button
            key={step.key}
            type="button"
            aria-pressed={current === index}
            onClick={() => setCurrent(index)}
          >
            <span className="listen-step-num">0{index + 1}</span>
            <strong>{step.label}</strong>
            <small>{step.short}</small>
          </button>
        ))}
      </div>

      <div className="listen-main">
        <div className="listen-screen">
          {listenSteps.map((step, index) => (
            <img
              key={step.file}
              src={asset(step.file)}
              width={step.width}
              height={step.height}
              alt={step.alt}
              aria-hidden={current !== index}
              className={current === index ? "is-active" : undefined}
              loading="lazy"
            />
          ))}
          <div className="listen-screen-bar">
            <span>{listenSteps[current]?.label}</span>
            <span>界面演示</span>
          </div>
        </div>

        <div className="listen-subtitles">
          <div className="listen-sub-head">
            <span>视频原有字幕</span>
            <span>点击跳转</span>
          </div>
          {listenLines.map((line, index) => (
            <button
              key={line.time}
              type="button"
              aria-pressed={activeLine === index}
              onClick={() => setActiveLine(index)}
            >
              <time>{line.time}</time>
              <span>{line.text}</span>
            </button>
          ))}
          <p>字幕来自视频已有字幕轨，不是 AI 生成。</p>
        </div>
      </div>

      <p className="listen-note" aria-live="polite">
        {listenSteps[current]?.note}
      </p>
    </div>
  );
}
