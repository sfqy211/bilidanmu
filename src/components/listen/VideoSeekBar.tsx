import { useTranslation as useDesktopTranslation } from "@/i18n";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { formatClock } from "@/lib/time";

const FINE_RANGE_RATIO = 0.05;
const MAX_FINE_RANGE_SECONDS = 120;
const FINE_ENTER_DISTANCE = 24;
const FINE_EXIT_DISTANCE = 8;
const TRACK_INSET = 6;

interface FineRange {
  start: number;
  end: number;
}

interface SeekPreview {
  time: number;
  range: FineRange | null;
}

interface SeekGesture extends SeekPreview {
  pointerId: number;
  duration: number;
  trackLeft: number;
  trackTop: number;
  trackWidth: number;
  anchorX: number;
  anchorTime: number;
}

function clampTime(time: number, start: number, end: number) {
  return Math.min(end, Math.max(start, time));
}

function formatSeekTime(time: number) {
  const tenths = Math.round(time * 10);
  return `${formatClock(tenths / 10)}.${tenths % 10}`;
}

function makeFineRange(time: number, duration: number, pointerRatio: number): FineRange {
  const span = Math.min(duration * FINE_RANGE_RATIO, MAX_FINE_RANGE_SECONDS);
  // 将当前时间对齐到上层刻度中的指针位置，切入精调时保持时间连续。
  const start = clampTime(time - pointerRatio * span, 0, duration - span);
  return { start, end: start + span };
}

function makeTicks(range: FineRange) {
  const span = range.end - range.start;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30];
  const majorStep = steps.find((step) => step >= span / 4) ?? 30;
  const minorStep = majorStep / 5;
  const first = Math.ceil(range.start / minorStep);
  const last = Math.floor(range.end / minorStep);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => {
    const ordinal = first + index;
    const time = ordinal * minorStep;
    return {
      time,
      major: ordinal % 5 === 0,
      percent: (time - range.start) / span * 100,
      label: majorStep < 1 ? formatSeekTime(time) : formatClock(time),
    };
  });
}

export function VideoSeekBar({ currentTime, duration, disabled, onSeek, onScrubStart }: {
  currentTime: number;
  duration: number;
  disabled: boolean;
  onSeek: (time: number) => void;
  onScrubStart: () => void;
}) {
  const { t: translate } = useDesktopTranslation("desktop");
  const inputRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<SeekGesture | null>(null);
  const [preview, setPreview] = useState<SeekPreview | null>(null);
  const descriptionId = useId();
  const totalDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const unavailable = disabled || totalDuration === 0;
  const playbackTime = Number.isFinite(currentTime) ? currentTime : 0;
  const time = preview?.time ?? clampTime(playbackTime, 0, totalDuration);
  const range = preview?.range ?? null;
  const ticks = useMemo(() => range ? makeTicks(range) : [], [range]);
  const percent = totalDuration > 0 ? time / totalDuration * 100 : 0;

  const cancelGesture = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setPreview(null);
    if (gesture && inputRef.current?.hasPointerCapture(gesture.pointerId)) {
      inputRef.current.releasePointerCapture(gesture.pointerId);
    }
  }, []);

  useEffect(() => {
    // 媒体重载时撤销原生指针捕获，避免旧手势的松开事件提交到新音轨。
    if (unavailable && gestureRef.current) cancelGesture();
  }, [unavailable, cancelGesture]);

  const cancelPointer = (event: PointerEvent<HTMLInputElement>) => {
    if (gestureRef.current?.pointerId === event.pointerId) cancelGesture();
  };

  const updateGesture = (event: PointerEvent<HTMLInputElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const span = gesture.range ? gesture.range.end - gesture.range.start : gesture.duration;
    gesture.time = clampTime(gesture.anchorTime + (event.clientX - gesture.anchorX) / gesture.trackWidth * span,
      gesture.range?.start ?? 0, gesture.range?.end ?? gesture.duration);

    if (!gesture.range && event.clientY < gesture.trackTop - FINE_ENTER_DISTANCE) {
      const pointerRatio = clampTime((event.clientX - gesture.trackLeft) / gesture.trackWidth, 0, 1);
      gesture.range = makeFineRange(gesture.time, gesture.duration, pointerRatio);
      gesture.anchorX = event.clientX;
      gesture.anchorTime = gesture.time;
    } else if (gesture.range && event.clientY >= gesture.trackTop + FINE_EXIT_DISTANCE) {
      gesture.range = null;
      gesture.anchorX = event.clientX;
      gesture.anchorTime = gesture.time;
    }
    setPreview({ time: gesture.time, range: gesture.range });
  };

  const startGesture = (event: PointerEvent<HTMLInputElement>) => {
    if (unavailable || event.button !== 0 || !event.isPrimary || gestureRef.current) return;
    event.preventDefault();
    const input = event.currentTarget;
    const rect = input.getBoundingClientRect();
    const trackLeft = rect.left + TRACK_INSET;
    const trackWidth = Math.max(1, rect.width - TRACK_INSET * 2);
    const selectedTime = clampTime((event.clientX - trackLeft) / trackWidth * duration, 0, duration);
    input.focus({ preventScroll: true });
    input.setPointerCapture(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId, duration, trackLeft, trackWidth, trackTop: rect.top,
      anchorX: event.clientX, anchorTime: selectedTime, time: selectedTime, range: null,
    };
    setPreview({ time: selectedTime, range: null });
    onScrubStart();
  };

  const finishGesture = (event: PointerEvent<HTMLInputElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    updateGesture(event);
    const selectedTime = Math.round(gesture.time * 10) / 10;
    cancelGesture();
    if (!unavailable) onSeek(clampTime(selectedTime, 0, duration));
  };

  const rangeStyle = range ? {
    "--seek-range-left": `${range.start / duration * 100}%`,
    "--seek-range-right": `${range.end / duration * 100}%`,
    "--seek-local-position": `${(time - range.start) / (range.end - range.start) * 100}%`,
  } as CSSProperties : undefined;

  return <div className="video-window-progress video-seek" data-scrubbing={preview ? "" : undefined}
    data-precision={range ? "" : undefined} style={rangeStyle}>
    <span id={descriptionId} className="sr-only">{translate("seek.hint")}</span>
    {range && <div className="video-seek-detail" data-interactive aria-hidden="true">
      <div className="video-seek-detail-surface">
        <div className="video-seek-readout">
          <span className="numeric">{formatSeekTime(time)}</span>
          <span>{translate("seek.precision") + " "}{Number(((range.end - range.start) / duration * 100).toFixed(2))}{translate("seek.range")}</span>
        </div>
        <div className="video-seek-ruler">
          {ticks.map((tick) => <span key={tick.time} className={`video-seek-tick${tick.major ? " is-major" : ""}`} style={{ left: `${tick.percent}%` }}>
            {tick.major && <span className="numeric" data-edge={tick.percent < 8 ? "start" : tick.percent > 92 ? "end" : undefined}>{tick.label}</span>}
          </span>)}
          <span className="video-seek-needle" />
        </div>
      </div>
      <div className="video-seek-connector" />
    </div>}
    <div className="video-seek-overview">
      <div className="video-seek-rail" aria-hidden="true">
        <span className="video-seek-fill" style={{ width: `${percent}%` }} />
        {range && <span className="video-seek-window" />}
        <span className="video-seek-thumb" style={{ left: `${percent}%` }} />
      </div>
      {!range && <div className="video-seek-hint" aria-hidden="true"><span className="numeric">{formatSeekTime(time)}</span><span>{translate("seek.drag")}</span></div>}
      <input ref={inputRef} type="range" aria-label={translate("seek.progress")} aria-describedby={descriptionId}
        aria-valuetext={`${formatSeekTime(time)} / ${formatClock(totalDuration)}`} min={0} max={Math.max(1, totalDuration)} step={0.1}
        value={time} disabled={unavailable} onPointerDown={startGesture} onPointerMove={updateGesture}
        onPointerUp={finishGesture} onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer}
        onKeyDown={(event) => {
          if (event.key === "Escape" && gestureRef.current) { event.preventDefault(); cancelGesture(); }
        }} onChange={(event) => {
          if (!gestureRef.current && !unavailable) onSeek(event.target.valueAsNumber);
        }} />
    </div>
  </div>;
}
