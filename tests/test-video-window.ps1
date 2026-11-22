param([string]$Origin = 'http://localhost:3000')
$ErrorActionPreference = 'Stop'
$session = 'video-window-regression'
$fixturePath = (Join-Path $PSScriptRoot 'video-window.html').Replace('\', '/')
$fixtureUrl = "$Origin/@fs/$fixturePath"

function Invoke-Browser {
    & agent-browser --session $session @args
    if ($LASTEXITCODE -ne 0) { throw "浏览器操作失败 $args" }
}

function Assert-Page([string]$Code) {
    $script = @'
(async () => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 120));
  const button = (name) => document.querySelector(`button[aria-label="${name}"]`);
'@ + "`n" + $Code + "`n return 'passed'; })()"
    & agent-browser --session $session eval $script
    if ($LASTEXITCODE -ne 0) { throw '视频弹幕页面断言失败' }
}

function Test-TimelineDivider {
    $json = & agent-browser --session $session eval "(() => { const container = document.querySelector('.video-window-timelines').getBoundingClientRect(); const divider = document.querySelector('.video-window-divider').getBoundingClientRect(); return {x: divider.x + divider.width / 2, top: container.top + divider.height / 2, bottom: container.bottom - divider.height / 2, middle: container.top + container.height / 2}; })()"
    $layout = ($json -join "`n") | ConvertFrom-Json
    $x = [int]$layout.x
    $middle = [int]$layout.middle
    $top = [int][Math]::Floor($layout.top)
    $bottom = [int][Math]::Ceiling($layout.bottom)

    Invoke-Browser mouse move $x $middle
    Invoke-Browser mouse down
    Invoke-Browser mouse move $x $top
    Invoke-Browser mouse up
    Assert-Page @'
await settle();
const container = document.querySelector('.video-window-timelines').getBoundingClientRect();
const divider = document.querySelector('.video-window-divider');
const subtitle = document.querySelector('.video-timeline-pane[aria-label="字幕"]');
assert(divider.getAttribute('aria-valuenow') === '0', '拖动可到 0%');
assert(subtitle.getBoundingClientRect().height < 1 && subtitle.inert, '字幕完全折叠并退出键盘导航');
assert(Math.abs(divider.getBoundingClientRect().top - container.top) < 1, '分割栏抵达内容区顶端');
'@
    Invoke-Browser mouse move $x $top
    Invoke-Browser mouse down
    Invoke-Browser mouse move $x $middle
    Invoke-Browser mouse up
    Assert-Page @'
await settle();
assert(Math.abs(Number(document.querySelector('.video-window-divider').getAttribute('aria-valuenow')) - 50) <= 1, '顶部折叠后可重新拖开');
assert(!document.querySelector('.video-timeline-pane[aria-label="字幕"]').inert, '展开后恢复字幕交互');
'@
    Invoke-Browser mouse move $x $middle
    Invoke-Browser mouse down
    Invoke-Browser mouse move $x $bottom
    Invoke-Browser mouse up
    Assert-Page @'
await settle();
const container = document.querySelector('.video-window-timelines').getBoundingClientRect();
const divider = document.querySelector('.video-window-divider');
const danmaku = document.querySelector('.video-timeline-pane[aria-label="弹幕"]');
assert(divider.getAttribute('aria-valuenow') === '100', '拖动可到 100%');
assert(danmaku.getBoundingClientRect().height < 1 && danmaku.inert, '弹幕完全折叠并退出键盘导航');
assert(Math.abs(divider.getBoundingClientRect().bottom - container.bottom) < 1, '分割栏抵达内容区底部');
await new Promise((resolve) => setTimeout(resolve, 350));
assert(videoTest.saved.videoDanmakuAppearance.subtitleRatio === 1, '端点比例正常保存');
'@
    Invoke-Browser mouse move $x $bottom
    Invoke-Browser mouse down
    Invoke-Browser mouse move $x $middle
    Invoke-Browser mouse up
    Assert-Page @'
await settle();
assert(Math.abs(Number(document.querySelector('.video-window-divider').getAttribute('aria-valuenow')) - 50) <= 1, '底部折叠后可重新拖开');
assert(!document.querySelector('.video-timeline-pane[aria-label="弹幕"]').inert, '展开后恢复弹幕交互');
'@
    Invoke-Browser focus '.video-window-divider'
    Invoke-Browser press Home
    Assert-Page @'
assert(document.querySelector('.video-window-divider').getAttribute('aria-valuenow') === '0', 'Home 可折叠字幕');
'@
    Invoke-Browser press End
    Invoke-Browser press ArrowUp
    Assert-Page @'
assert(document.querySelector('.video-window-divider').getAttribute('aria-valuenow') === '95', '键盘可调整超过原 80% 上限');
'@
    Invoke-Browser press ArrowDown
    Assert-Page @'
assert(document.querySelector('.video-window-divider').getAttribute('aria-valuenow') === '100', '方向键可到达底部');
button('窗口设置').click(); await settle();
'@
    Invoke-Browser scrollintoview 'input[aria-label="字幕区域比例"]'
    Invoke-Browser focus 'input[aria-label="字幕区域比例"]'
    Invoke-Browser press Home
    Assert-Page @'
assert(document.querySelector('.video-window-divider').getAttribute('aria-valuenow') === '0', '设置滑块可到 0%');
'@
    Invoke-Browser press End
    Assert-Page @'
assert(document.querySelector('.video-window-divider').getAttribute('aria-valuenow') === '100', '设置滑块可到 100%');
document.querySelector('[aria-label="视频弹幕外观设置"] button[aria-label="关闭"]').click();
'@
    Invoke-Browser dblclick '.video-window-divider'
    Assert-Page @'
assert(document.querySelector('.video-window-divider').getAttribute('aria-valuenow') === '50', '双击恢复均分');
'@
    foreach ($ratio in @(0, 1)) {
        Invoke-Browser open "$fixtureUrl`?subtitleRatio=$ratio"
        Invoke-Browser wait 'main.video-danmaku-window'
        Assert-Page @'
await settle();
const ratio = Number(new URLSearchParams(location.search).get('subtitleRatio'));
assert(Number(document.querySelector('.video-window-divider').getAttribute('aria-valuenow')) === ratio * 100, '重新打开保留端点比例');
'@
    }
    Invoke-Browser open $fixtureUrl
    Invoke-Browser wait 'main.video-danmaku-window'
}

function Test-PrecisionSeek {
    $json = & agent-browser --session $session eval "document.querySelector('input[aria-label=视频播放进度]').getBoundingClientRect().toJSON()"
    $rect = ($json -join "`n") | ConvertFrom-Json
    $x = [int]($rect.x + $rect.width / 2)
    $y = [int]($rect.y + $rect.height / 2)
    $fineY = [int]($rect.y - 36)
    Invoke-Browser mouse move $x $y
    Invoke-Browser mouse down
    Invoke-Browser mouse move ($x + 20) $y
    Assert-Page @'
videoTest.coarseTime = Number(document.querySelector('[aria-label="视频播放进度"]').value);
assert(!document.querySelector('.video-seek-detail'), '横向拖动使用全片进度');
assert(videoTest.state.currentTime === 14, '拖动预览在松开时提交');
'@
    Invoke-Browser mouse move ($x + 20) $fineY
    Assert-Page @'
const input = document.querySelector('[aria-label="视频播放进度"]');
assert(document.querySelector('.video-seek-detail'), '向上移出唤出精调刻度');
assert(Math.abs(Number(input.value) - videoTest.coarseTime) < 0.1, '切入精调保持时间连续');
assert(document.querySelectorAll('input[type="range"][aria-label="视频播放进度"]').length === 1, '二级采用刻度带并共用同一滑动手势');
assert(document.querySelector('.video-seek-window') && document.querySelector('.video-seek-connector'), '局部范围与总进度保持视觉连接');
videoTest.fineTime = Number(input.value);
'@
    Invoke-Browser mouse move ($x + 60) $fineY
    Assert-Page @'
const time = Number(document.querySelector('[aria-label="视频播放进度"]').value);
const width = document.querySelector('[aria-label="视频播放进度"]').getBoundingClientRect().width - 12;
assert(Math.abs(time - videoTest.fineTime - 40 / width * 45) < 0.2, '15 分钟视频按 5% 范围精调');
videoTest.fineTime = time;
'@
    Invoke-Browser mouse move ($x + 60) $y
    Assert-Page @'
assert(!document.querySelector('.video-seek-detail'), '向下移回恢复全片调节');
assert(Math.abs(Number(document.querySelector('[aria-label="视频播放进度"]').value) - videoTest.fineTime) < 0.1, '退出精调保持时间连续');
'@
    Invoke-Browser mouse up
    Assert-Page @'
await settle();
assert(Math.abs(videoTest.state.currentTime - videoTest.fineTime) <= 0.1, '松开后提交精调时间');
await videoTest.broadcast({duration: 36_000, currentTime: 14}); await settle();
'@
    Invoke-Browser mouse move $x $y
    Invoke-Browser mouse down
    Invoke-Browser mouse move $x $fineY
    Assert-Page @'
const root = document.querySelector('.video-seek');
const start = parseFloat(root.style.getPropertyValue('--seek-range-left'));
const end = parseFloat(root.style.getPropertyValue('--seek-range-right'));
assert(Math.abs((end - start) / 100 * videoTest.state.duration - 120) < 0.01, '超长视频精调最多覆盖两分钟');
'@
    Invoke-Browser press Escape
    Invoke-Browser mouse up
    Assert-Page @'
assert(!document.querySelector('.video-seek-detail') && !document.querySelector('[data-scrubbing]'), 'Esc 取消并释放捕获');
assert(videoTest.state.currentTime === 14, '取消后保留原播放位置');
await videoTest.broadcast({duration: 900}); await settle();
'@
    Invoke-Browser focus 'input[aria-label="视频播放进度"]'
    Invoke-Browser press ArrowRight
    Assert-Page @'
await settle();
assert(Math.abs(videoTest.state.currentTime - 14.1) < 0.01, '保留原生方向键精度');
await videoTest.broadcast({currentTime: 14}); await settle();
'@
    Invoke-Browser mouse move $x $y
    Invoke-Browser mouse down
    Invoke-Browser mouse move $x $fineY
    Assert-Page @'
await videoTest.broadcast({loading: true}); await settle();
assert(!document.querySelector('[data-scrubbing]'), '媒体重新加载时取消未完成的拖动');
'@
    Invoke-Browser mouse up
    Assert-Page @'
assert(videoTest.state.currentTime === 14, '取消捕获后松开不提交旧时间');
await videoTest.broadcast({loading: false}); await settle();
'@
    Invoke-Browser mouse move $x $y
    Invoke-Browser mouse down
    Invoke-Browser mouse move $x $fineY
    Assert-Page @'
const input = document.querySelector('[aria-label="视频播放进度"]');
input.dispatchEvent(new PointerEvent('pointercancel', {pointerId: 999, bubbles: true}));
assert(document.querySelector('[data-scrubbing]'), '其他指针取消不会中断当前拖动');
input.dispatchEvent(new PointerEvent('pointercancel', {pointerId: 1, bubbles: true}));
assert(!input.hasPointerCapture(1), '指针取消释放捕获');
await settle();
assert(!document.querySelector('[data-scrubbing]'), '指针取消收起精调');
'@
    Invoke-Browser mouse up
}

function Test-WindowAppearance {
    Assert-Page @'
videoTest.initialSettings = structuredClone(videoTest.settingsStore.getState().settings);
'@
    Invoke-Browser click 'button[aria-label="窗口设置"]'
    Invoke-Browser click 'button[aria-label="主题"]'
    Invoke-Browser find role option click --name '浅色' --exact
    Invoke-Browser focus 'input[aria-label="背景不透明度"]'
    Invoke-Browser press Home
    Assert-Page @'
await settle();
const style = getComputedStyle(document.querySelector('main'));
assert(!document.documentElement.classList.contains('dark'), '浅色主题生效');
assert(style.borderTopWidth === '0px' && style.outlineWidth === '0px' && style.boxShadow === 'none', '低不透明度浅色窗口没有外描边');
assert(style.backgroundColor.includes('/ 0.1)'), '背景保留 10% 不透明度');
assert(style.clipPath.includes('8px'), '复用弹幕窗口的圆角裁切');
'@
    Invoke-Browser click 'button[aria-label="主题"]'
    Invoke-Browser find role option click --name '深色' --exact
    Assert-Page @'
await settle();
const style = getComputedStyle(document.querySelector('main'));
assert(document.documentElement.classList.contains('dark'), '深色主题生效');
assert(style.borderTopWidth === '0px' && style.boxShadow === 'none' && style.backgroundColor.includes('/ 0.1)'), '低不透明度深色窗口没有外描边');
'@
    Invoke-Browser click 'button[aria-label="主题"]'
    Invoke-Browser find role option click --name '跟随系统' --exact
    Invoke-Browser set media light
    Assert-Page @'
await settle();
assert(!document.documentElement.classList.contains('dark'), '响应系统浅色主题');
'@
    Invoke-Browser set media dark
    Assert-Page @'
await settle();
assert(document.documentElement.classList.contains('dark'), '响应系统深色主题');
videoTest.setLuminance(0.2);
'@
    Invoke-Browser click 'button[aria-label="主题"]'
    Invoke-Browser find role option click --name '跟随背景' --exact
    Assert-Page @'
await new Promise((resolve) => setTimeout(resolve, 300));
assert(videoTest.settingsStore.getState().backgroundThemeOverride === 'dark', '偏暗屏幕背景使用深色');
assert(document.querySelector('button[aria-label="主题"]').textContent.includes('跟随背景'), '背景跟随选项保持选中');
videoTest.setLuminance(0.5);
await new Promise((resolve) => setTimeout(resolve, 200));
assert(videoTest.settingsStore.getState().backgroundThemeOverride === 'dark', '背景亮度中间区间保持主题');
videoTest.setLuminance(0.8);
await new Promise((resolve) => setTimeout(resolve, 250));
assert(videoTest.settingsStore.getState().backgroundThemeOverride === 'light' && !document.documentElement.classList.contains('dark'), '偏亮屏幕背景使用浅色');
assert(videoTest.calls.some(({command}) => command === 'sample_background_luminance'), '调用背景亮度采样');
assert(videoTest.calls.some(({command,args}) => command === 'update_settings' && args.settings.appearance.autoThemeFromBackground), '背景跟随设置持久化');
'@
    Invoke-Browser click 'button[aria-label="主题"]'
    Invoke-Browser find role option click --name '跟随系统' --exact
    Invoke-Browser set media light
    Assert-Page @'
await settle();
assert(videoTest.settingsStore.getState().backgroundThemeOverride === null, '关闭背景跟随清除主题覆盖');
'@
    Assert-Page @'
const { patchSettings, settings } = videoTest.settingsStore.getState();
patchSettings({
  visual: { ...settings.visual, light: { ...settings.visual.light, background: '#EDF6F1', contentFontFamily: 'serif' } },
  appearance: { ...settings.appearance, titleBarButtons: { ...settings.appearance.titleBarButtons, pin: false } },
});
await settle();
assert(getComputedStyle(document.querySelector('main')).getPropertyValue('--app-page').trim().toUpperCase() === '#EDF6F1', '跟随主窗口保存的背景颜色');
assert(/SimSun|宋体/.test(getComputedStyle(document.querySelector('.content-typography')).fontFamily), '内容字体应用到字幕与弹幕');
assert(!document.querySelector('.danmaku-window-titlebar button[aria-label="取消置顶"]'), '标题栏按钮隐藏即时生效');
assert(document.querySelector('.danmaku-window-titlebar button[aria-label="退出弹幕模式，返回视频页"]'), '退出入口始终可用');
'@
    Invoke-Browser click '[aria-label="视频弹幕外观设置"] button[aria-label="关闭"]'
    Assert-Page @'
videoTest.settingsStore.getState().setSettings(videoTest.initialSettings);
await settle();
assert(document.querySelector('.danmaku-window-titlebar button[aria-label="取消置顶"]'), '恢复标题栏按钮');
'@
}

try {
    Invoke-Browser open $fixtureUrl
    Invoke-Browser set viewport 440 680
    Invoke-Browser wait 'main.video-danmaku-window'
    Test-WindowAppearance
    Test-PrecisionSeek
    Test-TimelineDivider
    Assert-Page @'
await settle();
assert(document.querySelectorAll('.video-timeline-pane').length === 2, '上下两个时间轴');
assert(document.querySelectorAll('.video-timeline-line').length < 100, '高密度弹幕虚拟滚动');
assert(document.querySelectorAll('.video-timeline-time').length > 0, '默认显示行内时间');
assert(document.querySelector('.danmaku-window-titlebar').scrollWidth <= innerWidth, '标题栏完整显示');
document.querySelector('[aria-label="字幕"] .video-timeline-line[title="跳转到 00:00:20"]').click();
await settle();
assert(videoTest.state.currentTime === 20, '点击字幕跳转');
assert(document.querySelector('[aria-label="弹幕"] [aria-current="true"]'), '弹幕随字幕定位');
document.querySelector('[aria-label="弹幕"] .video-timeline-line').click();
await settle();
assert(videoTest.calls.some(({command,args}) => command === 'control_video_playback' && args.control.action === 'seek'), '点击弹幕共用播放时间轴');
button('暂停音频').click(); await settle();
assert(videoTest.state.playing === false, '播放暂停');
button('静音').click(); await settle();
assert(videoTest.state.volume === 0, '静音');
button('取消静音').click(); await settle();
assert(videoTest.state.volume === 50, '恢复原音量');
await videoTest.broadcast({currentTime: 725}); await settle();
assert(videoTest.calls.some(({command,args}) => command === 'get_video_danmaku' && args.segment === 3), '跨六分钟分段加载');
const oldTime = videoTest.state.currentTime;
await videoTest.emit('video-playback', {...videoTest.state, revision: 0, currentTime: 0}); await settle();
assert(Number(document.querySelector('[aria-label="视频播放进度"]').value) === oldTime, '忽略过期快照');
'@
    Invoke-Browser fill 'input[aria-label="发送视频弹幕"]' '本地回归弹幕'
    Invoke-Browser click 'button[aria-label="发送弹幕"]'
    Assert-Page @'
await settle();
const sent = videoTest.calls.filter(({command}) => command === 'send_video_danmaku');
assert(sent.length === 1 && sent[0].args.cid === 101 && sent[0].args.progress === 725, '发送目标分 P 与当前进度');
assert(document.querySelector('[aria-label="发送视频弹幕"]').value === '', '发送成功清空输入');
await videoTest.setErrors({send: true}); await settle();
'@
    Invoke-Browser fill 'input[aria-label="发送视频弹幕"]' '失败后保留草稿'
    Invoke-Browser click 'button[aria-label="发送弹幕"]'
    Assert-Page @'
await settle();
assert(document.querySelector('[aria-label="发送视频弹幕"]').value === '失败后保留草稿', '发送失败保留输入');
await videoTest.setErrors({}); await settle();
const input = document.querySelector('[aria-label="发送视频弹幕"]');
const before = videoTest.calls.filter(({command}) => command === 'send_video_danmaku').length;
input.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', isComposing: true, bubbles: true, cancelable: true}));
input.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true}));
assert(videoTest.calls.filter(({command}) => command === 'send_video_danmaku').length === before, '输入法确认回车不发送');
button('窗口设置').click(); await settle();
assert(document.querySelector('[aria-label="视频弹幕外观设置"]'), '精简外观设置');
assert(!document.querySelector('[aria-label="视频弹幕外观设置"]').textContent.includes('礼物'), '设置适配视频功能');
assert([...document.querySelectorAll('label.panel-check')].find((label) => label.textContent.includes('字幕与弹幕自动跟随')).querySelector('input').checked, '旧设置缺少字段时补默认值');
'@
    Assert-Page @'
[...document.querySelectorAll('label.panel-check')].find((label) => label.textContent.includes('显示行内时间')).querySelector('input').click();
await settle();
assert(document.querySelectorAll('.video-timeline-time').length === 0, '显示时间开关');
document.querySelector('[aria-label="视频弹幕外观设置"] button[aria-label="关闭"]').click();
button('切换视频').click(); await settle();
assert(document.querySelector('[aria-label="切换视频"]').getAttribute('aria-pressed') === 'true', '播放列表开启');
button('切换视频').click(); await settle();
assert(document.querySelector('button[aria-label="切换视频"]').getAttribute('aria-pressed') === 'false', '再次点击收起播放列表');
button('切换视频').click(); await settle();
document.querySelectorAll('.video-window-panel-host .panel-list button')[1].click(); await settle();
assert(videoTest.state.cid === 102, '切换分 P');
assert(document.body.textContent.includes('这个视频还没有字幕'), '空字幕');
assert(document.body.textContent.includes('当前时段还没有弹幕'), '空弹幕');
videoTest.setAnonymous(true); await settle();
assert(document.querySelector('[aria-label="发送视频弹幕"]').disabled, '匿名模式禁发');
button('锁定位置').click(); await settle();
const dragCount = videoTest.calls.filter(({command}) => command === 'plugin:window|start_dragging').length;
document.querySelector('.danmaku-window-titlebar > span').dispatchEvent(new MouseEvent('mousedown', {button: 0, bubbles: true})); await settle();
assert(videoTest.calls.filter(({command}) => command === 'plugin:window|start_dragging').length === dragCount, '锁定后标题栏停止拖动');
button('解锁位置').click(); await settle();
videoTest.setCursor({x: -200, y: -200});
button('开启隐身（鼠标离开自动隐藏）').click();
const opacityLayer = document.querySelector('main').parentElement;
for (let attempt = 0; attempt < 20 && getComputedStyle(opacityLayer).opacity !== '0'; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 50));
}
assert(getComputedStyle(opacityLayer).opacity === '0', '离开窗口后隐身');
videoTest.setCursor({x: 30, y: 20});
for (let attempt = 0; attempt < 20 && getComputedStyle(opacityLayer).opacity !== '1'; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 50));
}
assert(getComputedStyle(opacityLayer).opacity === '1', '悬停后显形');
button('关闭隐身').click();
button('开启窗口透传').click();
videoTest.setCursor({x: 5, y: 90}); await settle();
assert(videoTest.calls.filter(({command}) => command === 'plugin:window|set_ignore_cursor_events').at(-1).args.value === true, '内容空白区透传');
videoTest.setCursor({x: 15, y: 20}); await settle();
assert(videoTest.calls.filter(({command}) => command === 'plugin:window|set_ignore_cursor_events').at(-1).args.value === false, '交互区恢复鼠标事件');
button('关闭窗口透传').click(); await settle();
assert(!button('仅输入框模式') && document.querySelector('.video-window-timelines'), '视频窗保持完整形态');
'@
    Invoke-Browser set viewport 360 420
    Assert-Page @'
await settle();
assert(document.documentElement.scrollWidth <= innerWidth, '窄窗口无横向溢出');
assert(document.querySelector('.danmaku-window-titlebar').scrollWidth <= innerWidth, '窄窗口保留全部窗口按钮');
assert(document.querySelector('.video-window-footer').getBoundingClientRect().bottom <= innerHeight, '底部输入框保持可见');
document.documentElement.classList.add('dark');
await videoTest.broadcast({index: 0, cid: 101, currentTime: 20}); await settle();
for (const pane of document.querySelectorAll('.video-timeline-pane')) {
  const current = pane.querySelector('[aria-current="true"]');
  const viewport = pane.querySelector('.video-timeline-scroll');
  if (current && viewport) {
    assert(current.getBoundingClientRect().top >= viewport.getBoundingClientRect().top - 1, '动态行高下当前行可见');
    assert(current.getBoundingClientRect().bottom <= viewport.getBoundingClientRect().bottom + 1, '窄窗口当前行保持可见');
  }
}
await videoTest.setErrors({subtitle: true, danmaku: true});
await new Promise((resolve) => setTimeout(resolve, 2400));
assert(document.body.textContent.includes('字幕读取失败'), '字幕失败提示');
assert(document.body.textContent.includes('弹幕读取失败'), '弹幕失败提示');
await videoTest.setErrors({}); await settle();
assert(document.querySelectorAll('.video-timeline-line').length > 0, '失败后恢复');
'@
    Invoke-Browser open "$fixtureUrl`?surface=live"
    Invoke-Browser set viewport 460 640
    Invoke-Browser wait 'textarea[aria-label="发送直播弹幕"]'
    Assert-Page @'
await settle();
assert(document.querySelector('.danmaku-window-titlebar').textContent.includes('测试主播甲'), '真实直播页面使用共享标题栏');
assert(document.querySelector('.danmaku-window-audio'), '真实直播页面使用共享音量栏');
assert(!document.querySelector('.video-window-timelines'), '直播页面挂载直播内容');
await videoTest.emit('danmaku-received', {id:'live-dm',roomId:1001,type:'danmaku',uid:10,username:'测试观众',content:'直播消息接入回归',timestamp:Date.now()});
await videoTest.emit('danmaku-received', {id:'live-sc',roomId:1001,type:'superChat',uid:11,username:'醒目留言观众',content:'直播醒目留言回归',price:30,timestamp:Date.now()});
await new Promise((resolve) => setTimeout(resolve, 300));
assert(document.body.textContent.includes('直播消息接入回归') && document.body.textContent.includes('直播醒目留言回归'), '直播弹幕与礼物区继续接收事件');
button('静音').click(); await settle(); assert(button('取消静音'), '共享音量栏支持直播静音');
button('取消静音').click(); await settle(); assert(button('静音'), '直播解除静音');
document.querySelector('button[title="设置"]').click(); await settle();
assert(document.querySelector('.danmaku-window-appearance') && button('主题'), '直播页复用同一外观设置组件');
assert(document.body.textContent.includes('实时字幕') && document.body.textContent.includes('吸附动画'), '直播专属设置继续可用');
document.querySelector('button[title="设置"]').click(); await settle();
'@
    Invoke-Browser fill 'textarea[aria-label="发送直播弹幕"]' '直播发送回归'
    Assert-Page @'
const input = document.querySelector('textarea[aria-label="发送直播弹幕"]');
const count = videoTest.calls.filter(({command}) => command === 'send_danmaku').length;
input.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true}));
input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',isComposing:true,bubbles:true,cancelable:true}));
input.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true}));
assert(videoTest.calls.filter(({command}) => command === 'send_danmaku').length === count, '共享输入组件保护直播输入法确认');
const confirm = new KeyboardEvent('keydown', {key:'Enter',isComposing:true,bubbles:true,cancelable:true});
input.dispatchEvent(confirm);
assert(!confirm.defaultPrevented, '输入法确认保留原生选词行为');
await settle();
'@
    Invoke-Browser press Enter
    Assert-Page @'
await settle();
assert(videoTest.calls.some(({command,args}) => command === 'send_danmaku' && args.roomId === 1001 && args.msg === '直播发送回归'), '共享输入框仍走直播发送接口');
assert(document.querySelector('textarea[aria-label="发送直播弹幕"]').value === '', '直播发送成功清空输入');
button('锁定位置').click(); await settle();
const before = videoTest.calls.filter(({command}) => command === 'plugin:window|start_dragging').length;
document.querySelector('.danmaku-window-titlebar > span').dispatchEvent(new MouseEvent('mousedown', {bubbles:true,button:0})); await settle();
assert(videoTest.calls.filter(({command}) => command === 'plugin:window|start_dragging').length === before, '直播位置锁定适配器生效');
button('解锁位置').click(); await settle();
document.querySelector('.danmaku-window-titlebar > span').dispatchEvent(new MouseEvent('mousedown', {bubbles:true,button:0})); await settle();
assert(videoTest.calls.filter(({command}) => command === 'plugin:window|start_dragging').length === before + 1, '直播拖动仍调用原生窗口');
button('仅输入框模式').click(); await settle();
assert(document.querySelector('input[aria-label="发送直播弹幕"]') && !document.querySelector('.danmaku-window-titlebar'), '直播紧凑模式由原生事件切换');
await videoTest.emit('danmaku-input-only', false); await settle();
assert(document.querySelector('.danmaku-window-titlebar'), '恢复直播完整窗口');
const settings = videoTest.settingsStore.getState().settings;
videoTest.settingsStore.getState().patchSettings({appearance:{...settings.appearance,danmakuWindow:{...settings.appearance.danmakuWindow,functionBar:'compact'}}}); await settle();
assert(document.querySelector('button[title="更多功能"]'), '直播功能栏收纳模式继续可用');
document.querySelector('button[title="更多功能"]').click(); await settle();
assert(document.querySelector('button[title="设置"]'), '收纳菜单保留直播设置入口');
videoTest.settingsStore.getState().patchSettings({appearance:{...settings.appearance,titleBarButtons:{...settings.appearance.titleBarButtons,pin:false}}}); await settle();
assert(!document.querySelector('.danmaku-window-titlebar button[aria-label="取消置顶"]'), '直播标题栏同步公共显隐设置');
videoTest.settingsStore.getState().setSettings(settings); await settle();
document.querySelector('button[title="切换直播间"]').click(); await settle();
const next = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('测试主播乙'));
assert(next, '直播房间切换器仍列出开播房间'); next.click(); await settle();
assert(document.querySelector('.danmaku-window-titlebar').textContent.includes('测试主播乙'), '房间切换沿用原地路由和窗口');
assert(videoTest.calls.some(({command,args}) => command === 'connect_danmaku_stream' && args.roomId === 1002), '切房仍接入新直播流');
assert(!document.body.textContent.includes('直播消息接入回归'), '切房清理旧房间弹幕');
videoTest.setAnonymous(true); await settle();
assert(document.querySelector('textarea[aria-label="发送直播弹幕"]').disabled, '直播匿名模式禁发');
button('退出直播间').click(); await settle();
assert(videoTest.calls.some(({command}) => command === 'disconnect_danmaku_stream') && videoTest.calls.some(({command,args}) => command === 'exit_room' && args.roomId === 1002), '退出仍走直播断连与恢复主窗流程');
'@
    Invoke-Browser open "$fixtureUrl`?surface=main"
    Invoke-Browser set viewport 960 680
    Invoke-Browser wait 'button[title="在独立窗口中查看字幕与弹幕"]'
    Invoke-Browser click 'button[title="在独立窗口中查看字幕与弹幕"]'
    Assert-Page @'
await settle();
assert(videoTest.calls.some(({command}) => command === 'publish_video_playback'), '主窗口发布状态');
assert(videoTest.calls.some(({command}) => command === 'open_video_danmaku_window'), '视频页右侧入口');
const useVideoAudioStore = videoTest.player;
await videoTest.emit('video-playback-control', {bvid:'BVtest1',cid:101,control:{action:'seek',value:45}}); await settle();
assert(useVideoAudioStore.getState().currentTime === 45, '主窗口接收弹幕窗口控制');
await videoTest.emit('video-playback-control', {bvid:'BVtest1',cid:102,control:{action:'seek',value:99}}); await settle();
assert(useVideoAudioStore.getState().currentTime === 45, '过期分 P 请求不改变当前音轨');
useVideoAudioStore.setState({playTrackAt: async (index) => useVideoAudioStore.setState({index})});
const tracks = videoTest.calls.filter(({command}) => command === 'publish_video_playback').at(-1).args.snapshot.tracks;
await videoTest.emit('video-playback-control', {bvid:'BVtest1',cid:101,control:{action:'selectTrack',value:tracks[1].key}}); await settle();
assert(useVideoAudioStore.getState().index === 1, '按稳定曲目 key 切换队列条目');
await videoTest.emit('danmaku-entered', 0); await settle();
assert(videoTest.calls.some(({command,args}) => command === 'close_video_danmaku_window' && args.restoreMain === false), '进入直播时关闭视频窗口且保持直播窗口前台');
'@
    Write-Output '直播与视频共享弹幕窗口回归通过'
} finally {
    Invoke-Browser close
}
