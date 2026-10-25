// 基准：验证「每栏保留条数 = 0（无限制）」在 10 万条弹幕下是否可承受。
// 运行：node tests/test-store-100k.mjs
// 覆盖：
//   A. 写入路径对照——修复前（逐条 [...arr, msg] 整组复制）vs 修复后（批内收集 + 单次 concat）
//   B. 真实 store（当前实现）——10 万条单批洪峰 flush 耗时；100×1000 持续写入的每轮耗时是否随存量增长
//   C. 10 万条消息的 V8 堆增量（与 WebView2 同引擎，量级参考）
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(ROOT, "tests", "artifacts", "danmaku-store.bundle.mjs");
const TOTAL = 100_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── 打包真实 store（零拷贝验证当前实现，而非脚本地复刻） ──
const built = await build({
  entryPoints: [path.join(ROOT, "src", "stores", "danmaku-store.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  alias: { "@": path.join(ROOT, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "silent",
});
writeFileSync(ARTIFACT, built.outputFiles[0].text);
const { useDanmakuStore } = await import(pathToFileURL(ARTIFACT).href);

// ── 合成消息：字段与出现频率贴近真实弹幕（头像/勋章约三分之一，舰长偶发） ──
let seq = 0;
function makeMessage() {
  seq += 1;
  const hasMedal = seq % 3 === 0;
  return {
    id: `mock-0-${seq}-${Math.floor(Math.random() * 1e9)}`,
    roomId: 0,
    type: "danmaku",
    username: `用户_${(seq % 9973).toString(36)}`,
    content: `第${seq}条测试弹幕，含一段中文用于内存估算${seq % 5 === 0 ? "，长一点的弹幕内容占更多字节" : ""}`,
    timestamp: 1_760_000_000_000 + seq * 1000,
    avatar: seq % 3 === 1 ? `https://i0.hdslb.com/bfs/face/${(seq % 4096).toString(16)}.jpg` : undefined,
    medal: hasMedal ? { name: "粉丝团", level: 5 + (seq % 25), color: "#FF6699", uid: 42, anchorName: "主播", anchorUid: 4242 } : undefined,
    uid: 100_000_000 + (seq % 5000),
    guardLevel: seq % 60 === 0 ? 3 : 0,
    wealthLevel: seq % 7 === 0 ? 3 + (seq % 10) : undefined,
    dmType: 0,
  };
}
globalThis.gc; // 触发不了也无妨，堆增量只做量级参考
const preMade = Array.from({ length: TOTAL }, makeMessage);

// ── A. 写入路径对照（纯数组操作，同一份 10 万条数据） ──
function oldPattern() {
  let arr = [];
  for (let i = 0; i < TOTAL; i++) arr = [...arr, preMade[i]];
  return arr.length;
}
function newPattern() {
  let arr = [];
  for (let f = 0; f < TOTAL / 50; f++) arr = arr.concat(preMade.slice(f * 50, f * 50 + 50));
  return arr.length;
}
const oldMs = (() => { const t = performance.now(); oldPattern(); return performance.now() - t; })();
const newMs = (() => { const t = performance.now(); newPattern(); return performance.now() - t; })();

// ── B1. 真实 store：10 万条一次性洪峰（单批 flush） ──
const store = useDanmakuStore;
store.getState().setLimits(0); // 0 = 无限制（本次改动的新语义）
const tQueue = performance.now();
for (const m of preMade) store.getState().addMessage(m);
const queueMs = performance.now() - tQueue;
let burstFlushMs = 0;
for (const deadline = performance.now() + 30_000; performance.now() < deadline; ) {
  await sleep(50);
  if (store.getState().danmakuMessages.length === TOTAL) {
    burstFlushMs = performance.now() - tQueue;
    break;
  }
}
const count = store.getState().danmakuMessages.length;

// ── B2. 持续写入：100 轮 × 1000 条，看每轮耗时是否随存量增长（旧实现会二次方恶化） ──
store.getState().clearMessages();
const roundDur = [];
for (let r = 0; r < 100; r++) {
  const batch = preMade.slice(r * 1000, r * 1000 + 1000);
  const t = performance.now();
  for (const m of batch) store.getState().addMessage(m);
  await sleep(105); // flush 定时器 100ms
  roundDur.push(performance.now() - t);
}
const head = roundDur.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
const tail = roundDur.slice(-10).reduce((a, b) => a + b, 0) / 10;

// ── C. 内存：10 万条消息的堆增量 ──
await sleep(300);
const heapNow = process.memoryUsage().heapUsed;
const storeLen = store.getState().danmakuMessages.length;
const avgMsg = heapNow / Math.max(1, storeLen);

console.log("──────── 10 万条弹幕基准（V8/Node，与 WebView2 同引擎） ────────");
console.log(`A. 写入路径对照（10 万条）      修复前逐条展开: ${oldMs.toFixed(0)} ms   修复后批 concat: ${newMs.toFixed(2)} ms   （差 ${ (oldMs / newMs).toFixed(0) } 倍）`);
console.log(`B1. 洪峰单批 flush（含 100ms 定时器）  入队 ${queueMs.toFixed(0)} ms + flush ${burstFlushMs.toFixed(0)} ms ≈ 实际处理 ${Math.max(0, burstFlushMs - 100 - queueMs).toFixed(0)} ms，入列 ${count} 条`);
console.log(`B2. 持续写入每轮耗时（1000 条/轮）    前 10 轮均值 ${head.toFixed(1)} ms   后 10 轮均值 ${tail.toFixed(1)} ms   （持平=不随存量恶化）`);
console.log(`C. 内存（未强制 GC，量级参考）        当前存量 ${storeLen} 条，堆占用 ${(heapNow / 1024 / 1024).toFixed(1)} MB，均摊 ${avgMsg.toFixed(0)} B/条`);
