<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'

const props = withDefaults(defineProps<{
  mode: 'opacity' | 'dock'
  progress: number
  reduced?: boolean
}>(), { reduced: false })

const viewport = ref<HTMLDivElement | null>(null)
const scale = ref(1)
const manualDock = ref<boolean | null>(null)
let resizeObserver: ResizeObserver | undefined

const rows = [
  ['09:18', '品牌商城', '1002001', '落肩卫衣 · 灰 / M', '249.00', '已发货', '已同步物流'],
  ['09:42', '小程序', '1002002', '帆布袋 · 奶白', '129.00', '已发货', '礼品包装'],
  ['10:06', '品牌商城', '1002003', '卫衣 × 2 · 黑 / L', '388.00', '已发货', '合并发货'],
  ['10:24', '内容店铺', '1002004', '保温杯 · 岩灰', '169.00', '待发货', '地址待客户确认'],
  ['10:51', '品牌商城', '1002005', '秋季组合套装', '599.00', '已发货', '赠品已核对'],
  ['11:13', '小程序', '1002006', '轻量收纳包 · 蓝', '219.00', '待发货', '10/04 补货入库'],
  ['11:38', '内容店铺', '1002007', '随行杯套 · 沙色', '89.00', '已发货', '工作日配送'],
  ['12:05', '品牌商城', '1002008', '卫衣 + 帆布袋', '459.00', '已发货', '已确认尺码'],
  ['12:27', '小程序', '1002009', '拉链外套 · 黑 / M', '299.00', '待发货', '16:00 集中出库'],
  ['12:56', '内容店铺', '1002010', '保温杯 · 奶白', '179.00', '已发货', '已更新收货地址'],
]

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
const smooth = (value: number) => { const n = clamp(value); return n * n * (3 - 2 * n) }
const blend = (start: number, end: number, value: number) => start + (end - start) * smooth(value)
const progress = computed(() => clamp(props.progress))
const automaticOpacity = computed(() => {
  if (props.reduced) return 64
  const p = progress.value
  // 向下滚动从 100% 一路变到 10%：透出的桌面越来越清楚，变化全程可感知
  if (p < 0.12) return 100
  return Math.round(blend(100, 10, smooth((p - 0.12) / 0.55)))
})
const opacity = computed(() => automaticOpacity.value)
const automaticOpen = computed(() => {
  if (props.reduced) return 1
  // 滚动单调驱动：向下滚 = 侧边栏从右往左滑出，向上滚 = 收回。区间过后保持，回滚反向。
  const p = progress.value
  if (p < 0.08) return 0
  return smooth((p - 0.08) / 0.3)
})
const openAmount = computed(() => props.mode === 'opacity' ? 1 : manualDock.value === null ? automaticOpen.value : Number(manualDock.value))
const state = computed(() => props.mode === 'opacity' ? 'visible' : openAmount.value >= 0.98 ? 'expanded' : openAmount.value <= 0.02 ? 'collapsed' : 'sliding')
const isManual = computed(() => props.mode === 'dock' && manualDock.value !== null)
const backgroundOpacity = computed(() => props.mode === 'opacity' ? opacity.value / 100 : 0.83)
const paneTransform = computed(() => `translate3d(${(1 - openAmount.value) * 370}px,0,0)`)
const cursor = computed(() => {
  const p = progress.value
  const stops = [[0, 791, 299], [.2, 490, 346], [.38, 580, 355], [.46, 987, 283], [.61, 861, 282], [.7, 805, 330], [.81, 488, 346], [1, 434, 383]]
  const end = stops.findIndex(stop => stop[0] >= p)
  if (end <= 0) return { x: stops[0][1], y: stops[0][2] }
  const a = stops[end - 1], b = stops[end]
  const ratio = (p - a[0]) / (b[0] - a[0])
  return { x: blend(a[1], b[1], ratio), y: blend(a[2], b[2], ratio) }
})
const dockHint = computed(() => {
  if (props.reduced) return '点击右侧边条展开，也可用下方按钮收起。'
  if (isManual.value) return state.value === 'collapsed' ? '已收起。靠近右侧边条即可重新展开。' : '移开鼠标，窗口自动收起；按 Esc 也可收起。'
  return '向下滚动，侧边栏从右滑出；向上滚动收回。'
})

function reset() { manualDock.value = null }
function expand() { if (props.mode === 'dock') manualDock.value = true }
function collapse() {
  if (props.mode !== 'dock') return
  manualDock.value = false
}
function leavePane(event: PointerEvent) {
  if (event.pointerType === 'mouse' && !props.reduced) collapse()
}
function hoverEdge(event: PointerEvent) {
  if (event.pointerType === 'mouse') expand()
}
function leaveEdge(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || props.reduced) return
  const next = event.relatedTarget
  if (next instanceof Element && next.closest('.danmaku-pane')) return
  collapse()
}
function focusEdge() {
  expand()
}

onMounted(() => {
  if (!viewport.value) return
  scale.value = viewport.value.clientWidth / 1000
  resizeObserver = new ResizeObserver(entries => {
    const width = entries[0]?.contentRect.width
    if (width !== undefined) scale.value = width / 1000
  })
  resizeObserver.observe(viewport.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div class="desktop-demo" :data-mode="mode" :data-state="state" :data-control="isManual ? 'manual' : 'scroll'" :data-reduced="reduced" :data-opacity="opacity">
    <div ref="viewport" class="desktop-viewport" @keydown.esc.stop.prevent="collapse">
      <div class="desktop-canvas" :style="{ transform: `scale(${scale})` }">
        <div class="desktop-label">交互演示 <span>日常工作，也能有点陪伴</span></div>
        <div class="work-scenery" aria-hidden="true">
          <section class="work-sheet office-window">
            <header class="office-titlebar"><span class="file-mark">表</span><strong>10月运营 · 订单履约跟进表</strong><small>已保存到云端</small><span class="window-actions">—　□　×</span></header>
            <div class="sheet-menu"><b>文件</b><span class="selected">开始</span><span>插入</span><span>数据</span><span>公式</span><span>视图</span><span class="menu-search">搜索工具和内容</span></div>
            <div class="sheet-toolbar"><span>↶　↷</span><span>等线　⌄</span><span>11　⌄</span><b>B</b><i>I</i><u>U</u><span>≡　▦</span><span>¥　%</span><span>筛选 ⌄</span><span>条件格式 ⌄</span></div>
            <div class="sheet-formula"><span>E12　⌄</span><i>ƒx</i><span>=SUM(E2:E11)</span></div>
            <div class="sheet-row sheet-letters"><span /><span>A</span><span>B</span><span>C</span><span>D</span><span>E</span><span>F</span><span>G</span></div>
            <div class="sheet-row sheet-head"><span>1</span><span>下单时间</span><span>销售渠道</span><span>订单编号</span><span>商品 / 规格</span><span>实付金额</span><span>履约状态</span><span>跟进备注</span></div>
            <div v-for="(row, index) in rows" :key="row[2]" class="sheet-row" :class="{ pending: row[5] === '待发货' }"><span>{{ index + 2 }}</span><span v-for="(cell, column) in row" :key="column">{{ cell }}</span></div>
            <div class="sheet-row sheet-total"><span>12</span><span>当日合计</span><span>10 笔订单</span><span /><span /><span class="selected-cell">2779.00</span><span>3 笔待发货</span><span>16:00 前更新结果</span></div>
            <div class="sheet-notes">跟进提醒　地址确认：陈悦　·　补货协调：周宁 <span>最后编辑 14:18</span></div>
            <div class="sheet-tabs"><span>＋</span><b>订单明细</b><span>渠道汇总</span><span>库存核对</span><span>数据说明</span></div>
            <footer class="sheet-footer"><span>就绪</span><span>计数：10　　求和：2,779.00</span><span>100%</span></footer>
          </section>
          <section class="work-document office-window">
            <header class="office-titlebar"><span class="file-mark document-mark">文</span><strong>秋季上新 · 活动执行方案</strong><span class="window-actions">—　□　×</span></header>
            <div class="document-toolbar">正文　⌄　　微软雅黑　⌄　　12　　<b>B</b>　<i>I</i>　≡</div>
            <div class="document-body"><small>内部协作 / 版本 1.3 · 10月02日更新</small><h4>秋季上新 · 执行确认清单</h4><p>活动时间：10月08日 — 10月11日<br>负责人：林晓　｜　协作：陈悦、周宁</p><h5>01　上线前检查</h5><p>商品页统一尺码、库存与预计发货时间。<br>上线前完成优惠核对，避免重复咨询。</p><div class="document-check">✓　商品主图与详情页已确认</div><div class="document-check">✓　会员优惠与组合价已核对</div><div class="document-check document-pending">□　补货到仓时间待供应商回复</div><h5>02　订单与客服跟进</h5><p>14:00 汇总未发货订单，标记地址异常单；<br>16:00 前完成客户回访并更新处理进度。</p><div class="document-comment"><b>陈悦 <small>14:12</small></b><p>地址待确认的订单已标记，补货数量<br>请按最新库存表核对。</p></div></div>
          </section>
          <div class="desktop-taskbar"><span class="start-mark"><i /><i /><i /><i /></span><span class="taskbar-search">搜索</span><span class="taskbar-folder" /><span class="taskbar-app">表</span><span class="taskbar-app doc">文</span><span class="taskbar-clock">14:26<br><small>10月2日</small></span></div>
        </div>

        <div
          class="danmaku-pane"
          :class="{ 'manual-motion': isManual && !reduced }"
          :style="{ transform: paneTransform, boxShadow: `0 10px 32px rgba(32,60,82,${0.12 * (backgroundOpacity + 0.15)})` }"
          :data-state="state"
          role="group"
          aria-label="直播弹幕窗口演示"
          @pointerenter="mode === 'dock' && isManual && expand()"
          @pointerleave="leavePane"
        >
          <div class="danmaku-background" :style="{ opacity: backgroundOpacity }" />
          <img :src="withBase('/marketing/danmaku-content.webp')" width="330" height="482" alt="BiliDanmu 直播弹幕窗口，显示观众消息与播放控制" draggable="false">
        </div>
        <button
          v-if="mode === 'dock'"
          class="edge-trigger"
          type="button"
          :aria-expanded="state === 'expanded'"
          aria-label="展开侧边弹幕窗口"
          :data-state="state"
          @pointerenter="hoverEdge"
          @pointerleave="leaveEdge"
          @focus="focusEdge"
          @click="expand"
        ><span /><span class="edge-arrow">‹</span></button>
        <svg v-if="mode === 'dock' && !reduced && !isManual" class="demo-cursor" viewBox="0 0 26 34" aria-hidden="true" :style="{ transform: `translate3d(${cursor.x}px,${cursor.y}px,0)` }"><path d="M3 2v25l6-6 5 11 5-2-5-10h9Z" /></svg>
      </div>
    </div>

    <div class="demo-controls">
      <template v-if="mode === 'opacity'">
        <span class="opacity-readout">窗口背景 <output>{{ opacity }}%</output></span>
        <span class="control-note">随滚动实时变化</span>
      </template>
      <template v-else>
        <p class="dock-hint">{{ dockHint }}</p>
        <button type="button" class="text-control" @click="state === 'collapsed' ? expand() : collapse()">{{ state === 'collapsed' ? '展开窗口' : '收起窗口' }}</button>
        <button v-if="isManual && !reduced" type="button" class="reset-control" @click="reset">继续滚动演示 <span aria-hidden="true">↗</span></button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.desktop-demo { --demo-ink: var(--lp-ink, #283344); --demo-muted: var(--lp-muted, #657080); --demo-line: var(--lp-line, #dce1e8); --demo-accent: var(--lp-accent, #c73d66); --demo-surface: var(--lp-surface, #fafbfd); color: var(--demo-ink); width: 100%; min-width: 0; }
.desktop-viewport { position: relative; width: 100%; aspect-ratio: 1000 / 690; overflow: hidden; border: 1px solid var(--demo-line); border-radius: 14px; background: #eef3f7; isolation: isolate; }
.desktop-canvas { position: absolute; inset: 0 auto auto 0; width: 1000px; height: 690px; transform-origin: top left; background: linear-gradient(130deg, #f5f7fa, #e9eff5); color: #344352; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; font-size: 11px; line-height: 1.4; }
.desktop-label { position: absolute; left: 27px; top: 16px; color: #687887; font-size: 11px; letter-spacing: .04em; }
.desktop-label span { margin-left: 12px; color: #85919c; letter-spacing: 0; }
.office-window { position: absolute; overflow: hidden; border: 1px solid #cfd9e1; border-radius: 8px; background: #fdfefe; box-shadow: 0 12px 30px #1d38521a; }
.work-sheet { left: 25px; top: 47px; width: 924px; }
.office-titlebar { display: flex; align-items: center; height: 36px; gap: 9px; padding: 0 13px; background: #f2f6f5; border-bottom: 1px solid #dce4e8; }
.office-titlebar strong { font-size: 11px; font-weight: 600; }
.office-titlebar small { margin-left: 14px; font-size: 9px; color: #7b8a87; }
.window-actions { margin-left: auto; color: #7b8890; font-size: 10px; }
.file-mark { display: grid; place-items: center; width: 19px; height: 20px; color: #f7fcfa; background: #467b66; border-radius: 3px; font-size: 10px; }
.sheet-menu { display: flex; align-items: center; gap: 21px; height: 28px; padding: 0 15px; border-bottom: 1px solid #e6ebee; font-size: 10px; }
.sheet-menu b { color: #3b785b; font-weight: 500; }
.sheet-menu .selected { height: 28px; padding-top: 6px; border-bottom: 2px solid #4f846a; }
.menu-search { margin-left: auto; color: #8e999f; padding-right: 18px; }
.sheet-toolbar { display: flex; gap: 18px; align-items: center; height: 33px; padding: 0 16px; border-bottom: 1px solid #e4e9ec; color: #54616c; font-size: 10px; }
.sheet-formula { display: flex; gap: 15px; align-items: center; height: 27px; background: #fbfcfd; border-bottom: 1px solid #dce3e8; font-size: 10px; }
.sheet-formula > span:first-child { padding-left: 16px; padding-right: 21px; border-right: 1px solid #dce3e8; }
.sheet-formula i { color: #758388; }
.sheet-row { display: grid; grid-template-columns: 31px 77px 87px 107px 178px 83px 103px 1fr; height: 25px; border-bottom: 1px solid #e2e8ec; font-size: 10px; }
.sheet-row > span { display: flex; align-items: center; overflow: hidden; white-space: nowrap; padding: 0 10px; border-right: 1px solid #e2e8ec; }
.sheet-row > span:first-child { padding: 0; justify-content: center; color: #94a0a7; background: #f3f6f8; font-size: 9px; }
.sheet-row > span:nth-child(6) { justify-content: flex-end; font-variant-numeric: tabular-nums; }
.sheet-letters { height: 20px; color: #89969f; background: #f4f7f8; font-size: 9px; }
.sheet-letters > span { justify-content: center; }
.sheet-letters > span:nth-child(6) { justify-content: center; }
.sheet-head { height: 30px; background: #e9f1ed; color: #476457; font-weight: 600; }
.sheet-row.pending { background: #fcfaf2; }
.sheet-row.pending > span:nth-child(7) { color: #a17b37; }
.sheet-total { background: #f0f6f2; font-weight: 600; }
.sheet-total .selected-cell { border: 1.5px solid #4a8567; }
.sheet-notes { height: 35px; display: flex; align-items: center; padding: 0 18px; color: #778791; font-size: 9px; }
.sheet-notes span { margin-left: auto; }
.sheet-tabs { display: flex; align-items: center; height: 31px; gap: 22px; padding: 0 18px; border-top: 1px solid #e0e6e9; font-size: 10px; }
.sheet-tabs b { height: 31px; padding: 8px 8px 0; color: #477a5e; border-bottom: 2px solid #477a5e; font-weight: 600; }
.sheet-footer { height: 22px; display: flex; justify-content: space-between; align-items: center; background: #f0f4f6; color: #81909a; padding: 0 13px; font-size: 8px; }
.work-document { left: 377px; top: 146px; width: 509px; height: 475px; }
.work-document .office-titlebar { background: #f1f4f8; }
.document-mark { background: #637f9e; }
.document-toolbar { padding: 10px 17px; border-bottom: 1px solid #e4e9ee; background: #fafbfd; font-size: 10px; }
.document-body { padding: 22px 33px; }
.document-body > small { color: #88949e; font-size: 8px; }
.document-body h4 { margin: 9px 0 10px; font-size: 17px; line-height: 1.4; font-weight: 600; color: #354351; }
.document-body p { margin: 0 0 13px; color: #78848e; font-size: 10px; line-height: 1.85; }
.document-body h5 { margin: 13px 0 7px; font-size: 11px; color: #4d5b68; font-weight: 600; }
.document-check { padding: 3px 0; color: #637c70; font-size: 10px; }
.document-pending { color: #8e8266; }
.document-comment { padding: 9px 12px; border-left: 2px solid #a9bac7; background: #f3f6f8; }
.document-comment b { color: #677787; font-size: 9px; font-weight: 600; }
.document-comment small { color: #99a4ac; margin-left: 8px; font-size: 8px; font-weight: 400; }
.document-comment p { margin: 4px 0 0; font-size: 9px; }
.desktop-taskbar { position: absolute; inset: auto 0 0; height: 42px; display: flex; align-items: center; justify-content: center; gap: 17px; border-top: 1px solid #dae3e9; background: #f5f8fbd9; }
.start-mark { display: grid; grid-template-columns: 8px 8px; gap: 2px; }
.start-mark i { height: 8px; background: #769cb9; }
.taskbar-search { padding: 5px 40px 5px 12px; border: 1px solid #dce5ed; border-radius: 15px; color: #8d9ca7; background: #edf2f6; font-size: 10px; }
.taskbar-folder { width: 21px; height: 16px; background: #e4c58a; border-top: 4px solid #cfb27e; border-radius: 3px; }
.taskbar-app { width: 19px; height: 21px; display: grid; place-items: center; color: #f5fcf7; background: #698b7b; border-radius: 3px; font-size: 10px; }
.taskbar-app.doc { background: #7d92ac; }
.taskbar-clock { position: absolute; right: 24px; text-align: right; line-height: 1.35; color: #6c7f8d; font-size: 10px; }
.taskbar-clock small { font-size: 8px; }
.danmaku-pane { position: absolute; left: 620px; top: 45px; width: 330px; height: 482.3077px; border: 1px solid #dce1e4a6; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 32px #203c521f; isolation: isolate; }
.danmaku-pane.manual-motion { transition: transform 300ms cubic-bezier(.22,1,.36,1); }
.danmaku-background { position: absolute; inset: 0; z-index: -1; background: #fff; }
.danmaku-pane img { display: block; width: 100%; height: 100%; object-fit: contain; user-select: none; }
.edge-trigger { position: absolute; right: 0; top: 232px; width: 20px; height: 112px; padding: 0; border: 1px solid #d4dce4; border-right: 0; border-radius: 8px 0 0 8px; background: #f8fafced; color: #8493a0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.edge-trigger > span:first-child { display: block; width: 3px; height: 29px; border-radius: 2px; background: var(--demo-accent); opacity: .6; }
.edge-arrow { position: absolute; left: 3px; top: 76px; font-size: 16px; line-height: 1; }
.edge-trigger:focus-visible { outline: 3px solid var(--demo-accent); outline-offset: -4px; }
.demo-cursor { position: absolute; left: 0; top: 0; width: 23px; height: 30px; pointer-events: none; overflow: visible; filter: drop-shadow(0 2px 2px #24405f30); }
.demo-cursor path { fill: #fdfefe; stroke: #465667; stroke-width: 1.2; stroke-linejoin: round; }
.demo-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 14px 20px; padding: 16px 2px 0; min-height: 46px; font-size: 12px; }
.opacity-readout { display: flex; align-items: center; gap: 10px; color: var(--demo-muted); }
.opacity-readout output { min-width: 44px; font-variant-numeric: tabular-nums; font-size: 15px; font-weight: 600; color: var(--demo-ink); }
.control-note, .dock-hint { color: var(--demo-muted); line-height: 1.7; }
.dock-hint { flex: 1 1 220px; margin: 0; font-size: 12px; }
.demo-controls button { min-height: 38px; padding: 4px 0; border: 0; background: transparent; font: inherit; color: var(--demo-accent); cursor: pointer; white-space: nowrap; }
.reset-control { margin-left: auto; }
.reset-control span { margin-left: 4px; }
.demo-controls button:focus-visible, .opacity-control input:focus-visible { outline: 2px solid var(--demo-accent); outline-offset: 4px; border-radius: 3px; }
.desktop-demo[data-reduced="true"] .danmaku-pane { transition: none; }

@media (max-width: 600px) {
  .desktop-viewport { border-radius: 8px; }
  .demo-controls { gap: 4px 16px; padding-top: 10px; }
  .control-note { font-size: 10px; }
  .dock-hint { flex-basis: 100%; font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) { .danmaku-pane.manual-motion { transition: none; } }
</style>
