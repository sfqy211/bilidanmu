<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useData, withBase } from 'vitepress'
import DesktopDemo from './components/DesktopDemo.vue'
import './landing.css'

const { site } = useData()

/**
 * 内链规范化：withBase 之上再处理 cleanUrls。
 * GitHub Pages 不支持无扩展名路由（/guide/foo 会 404），Pages 构建
 * （cleanUrls=false）时内部页链接需补 .html；锚点插在后缀之前，
 * 目录路径（以 / 结尾）由 Pages 自动解析 index.html，保持原样。
 */
const base = (path: string) => {
  const url = withBase(path)
  if (site.value.cleanUrls) return url
  const hashIndex = url.indexOf('#')
  if (hashIndex === -1) {
    return url.endsWith('/') ? url : `${url}.html`
  }
  const pathPart = url.slice(0, hashIndex)
  const hash = url.slice(hashIndex)
  return pathPart.endsWith('/') ? url : `${pathPart}.html${hash}`
}
// 静态资源（图片/视频）走 withBase 即可：base() 的 .html 后缀只适用于页面路由，
// 资源加后缀会 404（logo.svg.html 之类）。
const asset = (file: string) => withBase(`/marketing/${file}`)
const download = 'https://github.com/sfqy211/bilidanmu/releases/latest'
const repository = 'https://github.com/sfqy211/bilidanmu'
/** 精选亮点：只有名称，说明留给文档站 features 页 */
const highlights = [
  { label: '透明弹幕窗', d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { label: '贴边收起', d: 'M3 3h18v18H3z M15 3v18' },
  { label: '仅输入框', d: 'M4 5h16v14H4z M9 9v6' },
  { label: '听视频连播', d: 'M3 14v-2a9 9 0 0 1 18 0v2 M21 14h-4v6h3a1 1 0 0 0 1-1v-5z M3 14h4v6H4a1 1 0 0 1-1-1z' },
  { label: '全局快捷键', d: 'M2 6h20v12H2z M6 10h.01 M10 10h.01 M14 10h.01 M18 10h.01 M7 14h10' },
  { label: '主题自定义', d: 'M12 2a10 10 0 1 0 0 20c1.5 0 2-1 2-2 0-1.5-1-1.5-1-3 0-1 .8-2 2-2h3a4 4 0 0 0 4-4c0-5-4.5-9-10-9z' },
]
const page = ref<HTMLElement>()
const filmDialog = ref<HTMLDialogElement>()
const film = ref<HTMLVideoElement>()
const filmTrigger = ref<HTMLButtonElement>()
const reduced = ref(false)
const mobileMenu = ref(false)
const pageProgress = ref(0)
const progress = reactive<Record<string, number>>({ transparent: 0, dock: 0, together: 0, listen: 0 })
const interactionOverride = ref<number | null>(null)
const interactionView = computed(() => interactionOverride.value ?? (reduced.value ? 0 : Math.min(2, Math.floor(progress.together * 3))))
const listenOverride = ref<number | null>(null)
const listenView = computed(() => listenOverride.value ?? (reduced.value ? 0 : Math.min(2, Math.floor(progress.listen * 3))))
const demoDark = ref(false)
const demoAccent = ref('#e95780')
const draft = ref('')
const lastMessage = ref('把喜欢的声音，放在身边。')
const sendNotice = ref('')
const activeSubtitle = ref(1)
const subtitleLines = [
  { time: '00:38', text: '把喜欢的声音，放在身边。' },
  { time: '01:02', text: '不必一直看着屏幕，也能好好享受。' },
  { time: '01:30', text: '每一次聆听，都是一次新的出发。' },
]
const listenerScreens = ['listen-fav.webp', 'player-start.webp', 'listen-mini.webp']
const listenerSteps = ['从收藏开始', '把视频当作音乐听', '逛别的页面，也继续听']
const interactionSteps = ['消息，各就各位', '常用的话，随手就发', '身份与节奏，自己安排']

function submitDemo() {
  const value = draft.value.trim()
  if (!value) return
  lastMessage.value = value
  draft.value = ''
  sendNotice.value = '已加入演示消息'
}
function openFilm() {
  filmDialog.value?.showModal()
  film.value?.play().catch(() => {})
}
function closeFilm() { filmDialog.value?.close() }
function onFilmClosed() {
  film.value?.pause()
  filmTrigger.value?.focus()
}

let raf = 0
let observer: IntersectionObserver | undefined
let motionQuery: MediaQueryList | undefined
let scenes: HTMLElement[] = []
const clamp = (n: number) => Math.max(0, Math.min(1, n))
function updateScroll() {
  raf = 0
  const height = window.innerHeight
  pageProgress.value = clamp(window.scrollY / Math.max(1, document.documentElement.scrollHeight - height))
  for (const scene of scenes) {
    const rect = scene.getBoundingClientRect()
    const key = scene.dataset.story!
    progress[key] = clamp((height * .12 - rect.top) / Math.max(1, rect.height - height * .7))
  }
}
function scheduleScroll() { if (!raf) raf = window.requestAnimationFrame(updateScroll) }
function onMotionChange() { reduced.value = Boolean(motionQuery?.matches); scheduleScroll() }
onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  onMotionChange()
  motionQuery.addEventListener('change', onMotionChange)
  scenes = [...(page.value?.querySelectorAll<HTMLElement>('[data-story]') ?? [])]
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('is-visible')
      observer?.unobserve(entry.target)
    }
  }, { threshold: .12 })
  page.value?.querySelectorAll('.lp-reveal').forEach(el => observer?.observe(el))
  window.addEventListener('scroll', scheduleScroll, { passive: true })
  window.addEventListener('resize', scheduleScroll)
  updateScroll()
})
onBeforeUnmount(() => {
  window.cancelAnimationFrame(raf)
  window.removeEventListener('scroll', scheduleScroll)
  window.removeEventListener('resize', scheduleScroll)
  motionQuery?.removeEventListener('change', onMotionChange)
  observer?.disconnect()
  film.value?.pause()
})
</script>

<template>
  <div ref="page" class="landing" :class="{ 'lp-reduced': reduced }">
    <a class="lp-skip" href="#main-content">跳转到主要内容</a>
    <header class="lp-header">
      <div class="lp-nav-wrap">
        <a class="lp-brand" :href="base('/')" aria-label="BiliDanmu 首页"><img :src="asset('logo.svg')" width="42" height="42" alt="" /><span>BiliDanmu</span></a>
        <nav class="lp-nav" aria-label="主要导航" :class="{ 'is-open': mobileMenu }">
          <a href="#experience" @click="mobileMenu = false">功能演示</a>
          <a :href="base('/guide/features.html')" @click="mobileMenu = false">全部功能 <span aria-hidden="true">↗</span></a>
          <a :href="base('/guide/quick-start')">使用指南 <span aria-hidden="true">↗</span></a>
          <a :href="repository" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
        </nav>
        <a class="lp-button lp-button-small" :href="download" target="_blank" rel="noopener noreferrer">下载 <span class="lp-desktop-label">Windows 版</span><span aria-hidden="true">↓</span></a>
        <button class="lp-menu-button" type="button" :aria-expanded="mobileMenu" aria-label="切换导航菜单" @click="mobileMenu = !mobileMenu">{{ mobileMenu ? '关闭' : '菜单' }}</button>
      </div>
      <div class="lp-read-progress" :style="{ transform: `scaleX(${pageProgress})` }" />
    </header>

    <main id="main-content">
      <section class="lp-hero lp-container">
        <div class="lp-hero-copy">
          <p class="lp-eyebrow"><span class="lp-live-dot" /> 一个懂你桌面的 B 站小工具</p>
          <h1>把热闹，<br/>轻轻放在<span>身边。</span></h1>
          <p class="lp-hero-description">透明弹幕窗、贴边收起、听视频。<br class="lp-wide-only"/>手上的事情继续，喜欢的声音也继续。</p>
          <div class="lp-hero-actions"><a class="lp-button" :href="download" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5l8-1v8H3zm10-1l8-1v9h-8zM3 14h8v7l-8-1zm10 0h8v9l-8-1z" fill="currentColor"/></svg>下载 Windows 版<span aria-hidden="true">↓</span></a><a class="lp-text-link" :href="base('/guide/quick-start')">从这里开始 <span aria-hidden="true">↗</span></a></div>
          <p class="lp-system-note">Windows 10 / 11 · x64 · 开源桌面应用</p>
          <button ref="filmTrigger" class="lp-film-link" type="button" @click="openFilm"><span class="lp-play-symbol" aria-hidden="true">▶</span> 看看它如何融入一天 <small>45 秒</small></button>
        </div>
        <div class="lp-hero-stage" aria-label="听视频与透明弹幕窗界面预览">
          <div class="lp-hero-glow"/>
          <div class="lp-hero-player"><img :src="asset('player-start.webp')" width="2400" height="1520" alt="BiliDanmu 听视频：唱片封面、同步字幕与播放控制" fetchpriority="high" /></div>
          <div class="lp-hero-danmaku"><img :src="asset('danmaku-content.webp')" width="1040" height="1520" alt="独立弹幕窗，显示实时消息、礼物和互动" /></div>
          <div class="lp-hero-note"><span class="lp-live-dot"/> 工作照常，快乐在线。</div>
          <span class="lp-scene-label">真实界面 · 演示内容</span>
        </div>
        <a href="#experience" class="lp-scroll-cue"><span aria-hidden="true">↓</span> 向下滚动，跟着体验一次。</a>
      </section>

      <div class="lp-feature-rail lp-container" aria-label="核心功能"><span>看直播弹幕</span><i/><span>透明与穿透</span><i/><span>贴边自动收起</span><i/><span>收藏夹接着听</span><i/><span>按习惯定制</span></div>

      <section id="experience" class="lp-chapter" data-story="transparent" :data-progress="progress.transparent.toFixed(3)">
        <div class="lp-chapter-inner lp-container">
          <div class="lp-chapter-copy">
            <p class="lp-section-number">01 / 桌面，留点空间</p>
            <h2>一点热闹，<br/>一点<span>存在感。</span></h2>
            
            <ul class="lp-tick-list"><li>背景不透明度 10–100% 自由调整</li><li>窗口置顶、锁定与点击穿透</li><li>大小、位置，下次打开还记得</li></ul>
            <a class="lp-text-link" :href="base('/guide/quick-start#_4-把窗口放到顺手的位置')">了解桌面操作 <span aria-hidden="true">↗</span></a>
          </div>
          <div class="lp-demo-wrap"><DesktopDemo mode="opacity" :progress="progress.transparent" :reduced="reduced"/><p class="lp-demo-caption"><span>滚动试看透明变化</span><span>也可以亲手拖动滑块</span></p></div>
        </div>
      </section>

      <section id="dock" class="lp-chapter lp-chapter-tint" data-story="dock" :data-progress="progress.dock.toFixed(3)">
        <div class="lp-chapter-inner lp-container">
          <div class="lp-chapter-copy"><p class="lp-section-number">02 / 需要时，再见面</p><h2>靠近就出。<br/>移开<span>就收。</span></h2><ul class="lp-tick-list"><li>左侧、右侧与顶部，都能贴边</li><li>展开后拖离边缘，恢复自由窗口</li><li>收起速度可调，托盘也能随时唤回</li></ul><span class="lp-scroll-instruction">继续滚动，看看这一进一出 <span aria-hidden="true">↓</span></span></div>
          <div class="lp-demo-wrap"><DesktopDemo mode="dock" :progress="progress.dock" :reduced="reduced"/><p class="lp-demo-caption"><span>侧边自动收起演示</span><span>试试将鼠标移向右侧边条</span></p></div>
        </div>
      </section>

      <section id="live" class="lp-chapter lp-interaction-chapter" data-story="together" :data-progress="progress.together.toFixed(3)">
        <div class="lp-chapter-inner lp-container">
          <div class="lp-chapter-copy"><p class="lp-section-number">03 / 直播间，也有条理</p><h2>每份热闹，<br/>都有<span>自己的位置。</span></h2><div class="lp-step-buttons" role="group" aria-label="选择直播互动演示"><button v-for="(title, i) in interactionSteps" :key="title" type="button" :aria-pressed="interactionView === i" @click="interactionOverride = i"><span>0{{ i + 1 }}</span>{{ title }}<span aria-hidden="true">↗</span></button></div><button v-if="interactionOverride !== null" class="lp-reset-demo" @click="interactionOverride = null">继续滚动演示 ↓</button></div>
          <div class="lp-interaction-board" :data-state="interactionView">
            <div class="lp-board-top"><div><span class="lp-live-dot"/><strong>星河电台</strong><span>正在直播</span></div><span>2.7k 在线</span></div>
            <div class="lp-interaction-tabs"><span :class="{active:interactionView===0}">消息与筛选</span><span :class="{active:interactionView===1}">表情与模板</span><span :class="{active:interactionView===2}">账号与互动</span></div>
            <div class="lp-message-stage">
              <div class="lp-superchat"><div><b>拾光</b><span>¥30</span></div><p>愿每个夜晚，都有好音乐相伴。</p></div>
              <div class="lp-message-line"><span class="lp-fan-badge">星河 12</span><b>晚风</b><span>晚上好，今天也来听歌啦</span></div>
              <div class="lp-message-line"><b class="lp-blue-name">拾光</b><span>戴上耳机，世界安静了</span></div>
              <div class="lp-message-line"><b>一颗橘子</b><span>前奏一响，心情就好了</span></div>
              <div class="lp-message-line lp-own-message"><b>我</b><span>{{ lastMessage }}</span></div>
              <div v-if="interactionView===0" class="lp-inline-panel lp-filter-panel"><span class="lp-panel-label">只留下想看的消息</span><div><span class="lp-filter-chip">全部</span><span>进场</span><span>点赞</span><span class="lp-muted-chip">关键词屏蔽</span></div><p>三栏独立滚动 · 向上翻阅时暂停跟随</p></div>
              <div v-else-if="interactionView===1" class="lp-inline-panel"><span class="lp-panel-label">常用表情与快捷消息</span><div class="lp-emoticon-demo"><button type="button" @click="draft='[比心]'" aria-label="选择比心表情">♡</button><button type="button" @click="draft='[点赞]'" aria-label="选择点赞表情">👍</button><button type="button" @click="draft='[鼓掌]'" aria-label="选择鼓掌表情">👏</button><button type="button" @click="draft='晚上好，主播辛苦啦！'">晚上好，主播辛苦啦！ <span>↗</span></button></div><p>收藏表情 · 隐藏不常用表情包 · 复用消息模板</p></div>
              <div v-else class="lp-inline-panel"><span class="lp-panel-label">发送身份，独立选择</span><div class="lp-account-demo"><span class="lp-avatar">我</span><b>我的账号</b><span class="lp-state-pill">当前发送身份</span></div><div class="lp-automation-demo"><span>循环发送 <small>文字 / 表情</small></span><span>按设定间隔</span></div><p>自动发送与点赞，进度可见，随时停止。</p></div>
            </div>
            <form class="lp-demo-composer" @submit.prevent="submitDemo"><label class="lp-sr-only" for="demo-message">输入演示弹幕</label><input id="demo-message" v-model="draft" maxlength="40" placeholder="试着发一句演示弹幕…" @input="sendNotice=''"/><button type="submit" :disabled="!draft.trim()" aria-label="发送演示弹幕">发送 <span aria-hidden="true">↗</span></button></form><div class="lp-demo-foot"><span>交互演示 · 不连接真实直播间</span><span role="status" aria-live="polite">{{ sendNotice }}</span></div>
          </div>
        </div>
      </section>

      <section id="listen" class="lp-chapter lp-listen-chapter" data-story="listen" :data-progress="progress.listen.toFixed(3)">
        <div class="lp-chapter-inner lp-container">
          <div class="lp-chapter-copy"><p class="lp-section-number">04 / 眼睛上班，耳朵放假</p><h2>喜欢的视频，<br/>换个方式<span>陪你。</span></h2><div class="lp-step-buttons" role="group" aria-label="选择听视频演示"><button v-for="(title,i) in listenerSteps" :key="title" type="button" :aria-pressed="listenView===i" @click="listenOverride=i"><span>0{{i+1}}</span>{{title}}<span aria-hidden="true">↗</span></button></div><button v-if="listenOverride!==null" class="lp-reset-demo" @click="listenOverride=null">继续滚动演示 ↓</button><a class="lp-text-link lp-listen-guide" :href="base('/guide/listen')">听视频使用指南 <span aria-hidden="true">↗</span></a></div>
          <div class="lp-listen-visual" :data-state="listenView"><div class="lp-listen-screen"><img v-for="(file,i) in listenerScreens" :key="file" :src="asset(file)" width="2400" height="1520" loading="lazy" :alt="listenerSteps[i]" :class="{active:listenView===i}" :aria-hidden="listenView!==i"/></div><div class="lp-listen-status"><span class="lp-equalizer" :class="{'is-playing':listenView>0}" aria-hidden="true"><i/><i/><i/><i/></span><span>{{ listenerSteps[listenView] }}</span><span>原生界面演示</span></div></div>
        </div>
      </section>

      <section class="lp-reading lp-container lp-reveal">
        <div><p class="lp-section-number">声音之外，还有文字</p><h2>想重听的那句，<br/>一点就到。</h2><a class="lp-text-link" :href="base('/guide/listen#跟随视频原有字幕')">了解字幕与评论 <span aria-hidden="true">↗</span></a></div>
        <div class="lp-subtitle-demo"><div class="lp-subtitle-top"><span>专注字幕</span><span aria-live="polite">当前定位 {{subtitleLines[activeSubtitle].time}}</span></div><button v-for="(line,i) in subtitleLines" :key="line.time" type="button" :class="{active:activeSubtitle===i}" :aria-pressed="activeSubtitle===i" @click="activeSubtitle=i"><time>{{line.time}}</time><span>{{line.text}}</span><span aria-hidden="true">↗</span></button><p>点一句试试 · 视频提供字幕时可用</p></div>
      </section>

      <section class="lp-appearance lp-reveal" id="appearance">
        <div class="lp-container lp-appearance-grid"><div><p class="lp-section-number">05 / 把习惯，留给自己</p><h2>你的桌面。<br/>你的<span>舒服样子。</span></h2><div class="lp-appearance-controls"><div class="lp-theme-toggle" role="group" aria-label="选择主题演示"><button type="button" :aria-pressed="!demoDark" @click="demoDark=false">☀ 浅色</button><button type="button" :aria-pressed="demoDark" @click="demoDark=true">☾ 深色</button></div><div class="lp-color-options" role="group" aria-label="选择强调色演示"><button v-for="color in ['#e95780','#467fba','#469480']" :key="color" type="button" :style="{background:color}" :aria-pressed="demoAccent===color" :aria-label="color==='#e95780'?'玫瑰色':color==='#467fba'?'蓝色':'绿色'" @click="demoAccent=color"><span v-if="demoAccent===color">✓</span></button></div></div></div>
          <div class="lp-theme-preview" :class="{'is-dark':demoDark}" :style="{'--preview-accent':demoAccent}"><div class="lp-theme-bar"><img :src="asset('logo.svg')" width="28" height="28" alt=""/><span>BiliDanmu</span><span>—　□　×</span></div><div class="lp-theme-body"><aside><b>直播间</b><span>账号</span><span>设置</span></aside><div><div class="lp-theme-heading"><h3>常看的直播</h3><span>3 个直播中</span></div><div v-for="(room,i) in ['星河电台','木木的工作室','晴天音乐盒']" :key="room" class="lp-theme-room"><img :src="asset(`cover-${i}.svg`)" width="64" height="44" alt=""/><span><b>{{room}}</b><small>{{['今晚，让音乐陪你久一点','把灵感慢慢变成作品','刚刚好的旋律'][i]}}</small></span><span class="lp-preview-live">直播中</span></div></div></div><div class="lp-theme-footer">字体与配色，自在一点。</div></div>
        </div>
      </section>

      <section id="highlights" class="lp-highlights lp-container lp-reveal">
        <div class="lp-section-heading"><div><p class="lp-section-number">不止这些</p><h2>顺手的小事，<br class="lp-mobile-only"/>也都照顾到了。</h2></div><a class="lp-text-link" :href="base('/guide/features.html')">查看全部功能 <span aria-hidden="true">↗</span></a></div>
        <ul class="lp-highlight-grid">
          <li v-for="item in highlights" :key="item.label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="item.d"/></svg>
            <span>{{ item.label }}</span>
          </li>
        </ul>
      </section>

      <section id="get-started" class="lp-start-section">
        <div class="lp-container"><div class="lp-section-heading"><div><p class="lp-section-number">准备好，给桌面一点快乐</p><h2>三步，开始你的陪伴。</h2></div><a class="lp-text-link" :href="base('/guide/quick-start')">完整使用说明 <span aria-hidden="true">↗</span></a></div><ol class="lp-start-steps"><li><span>01</span><h3>下载并安装</h3><p>选择 Windows x64 安装包。</p><a :href="download" target="_blank" rel="noopener noreferrer">获取 Windows 版 ↗</a></li><li><span>02</span><h3>选一种开始方式</h3><p>扫码登录，或匿名先逛逛。</p><a :href="base('/guide/quick-start')">看看如何开始 ↗</a></li><li><span>03</span><h3>把它放在顺手的位置</h3><p>添加房间，调好透明度，开听。</p><a href="#experience">再体验一遍 ↑</a></li></ol></div>
      </section>

      <section class="lp-faq lp-container"><div><p class="lp-section-number">再了解一点</p><h2>你可能想知道</h2></div><div class="lp-faq-list"><details><summary>不登录可以使用吗？<span>＋</span></summary><p>可以匿名接收直播弹幕和收听直播音频。发送弹幕、表情和自动互动，以及访问自己的收藏夹、稍后再看或发表评论，需要登录对应账号。</p></details><details><summary>关闭弹幕窗后，直播会断开吗？<span>＋</span></summary><p>关闭弹幕窗会隐藏到系统托盘，连接继续保留。需要真正离开直播间时，使用弹幕窗的退出按钮；之后会回到主窗口。</p></details><details><summary>支持哪些系统？<span>＋</span></summary><p>目前提供 Windows 10 / 11 的 x64 安装包，需要 WebView2 运行时。下载及安装说明中有更完整的步骤。</p></details><details><summary>每个视频都能显示字幕吗？<span>＋</span></summary><p>字幕取自视频已经提供的字幕轨。未提供字幕的视频仍可以收听与查看评论；有字幕时可以逐句跟随、点击跳转和切换专注视图。</p></details><details><summary>如何更新或反馈问题？<span>＋</span></summary><p>应用会定期检查更新，也可以在关于页手动检查、阅读更新说明并下载安装包。遇到问题时，可前往 <a :href="repository+'/issues'" target="_blank" rel="noopener noreferrer">GitHub Issues</a> 反馈。</p></details></div></section>

      <section class="lp-final-cta lp-container"><img :src="asset('logo.svg')" width="76" height="76" alt="声窗 Logo"/><h2>手头的事继续。<br/>喜欢的声音，也继续。</h2><a class="lp-button" :href="download" target="_blank" rel="noopener noreferrer">下载 BiliDanmu <span aria-hidden="true">↓</span></a><p>Windows 10 / 11 · 免费获取 · 开源</p></section>
    </main>

    <footer class="lp-footer lp-container"><a class="lp-brand" :href="base('/')"><img :src="asset('logo.svg')" width="32" height="32" alt=""/><span>BiliDanmu</span></a><p>为喜欢的直播和声音，留一个位置。</p><div><a :href="base('/guide/quick-start')">使用指南</a><a :href="repository" target="_blank" rel="noopener noreferrer">源码</a><a :href="repository+'/issues'" target="_blank" rel="noopener noreferrer">反馈</a><a :href="repository+'/blob/main/LICENSE'" target="_blank" rel="noopener noreferrer">AGPL-3.0</a></div><small>独立开源项目，与哔哩哔哩无官方关联。</small></footer>

    <dialog ref="filmDialog" class="lp-film-dialog" aria-labelledby="film-title" @close="onFilmClosed" @click="($event.target === filmDialog) && closeFilm()"><div class="lp-film-dialog-inner"><div><h2 id="film-title">BiliDanmu · 45 秒，认识一下</h2><button type="button" aria-label="关闭宣传视频" @click="closeFilm">关闭 ×</button></div><video ref="film" :src="asset('product-film.mp4')" :poster="asset('film-poster.webp')" controls playsinline preload="none" aria-label="BiliDanmu 产品演示视频，45秒，无旁白，含背景音乐"/><p>透明弹幕窗、侧边收起与听视频 · 1080p / 60fps</p></div></dialog>
  </div>
</template>
