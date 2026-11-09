import { useEffect, useRef, useState } from "react";
import { useColorMode } from "@docusaurus/theme-common";
import type { ReactNode } from "react";
import { PageTabs, TabContent } from "@/components/ui/PageTabs";
import { features, liveTabs, railItems } from "./data";
import { DeskDemo } from "./demos/DeskDemo";
import { ListenDemo } from "./demos/ListenDemo";
import { ThemePreview } from "./demos/ThemePreview";
import { createAsset, createLink, type LandingProps } from "./links";

const RELEASES = "https://github.com/sfqy211/bilidanmu/releases/latest";
const REPOSITORY = "https://github.com/sfqy211/bilidanmu";

// 下载直链指向具体版本的 release 资产（Tauri 产物本名就带版本号，无需 CI 改名）。
// 升级版本时由 scripts/bump-version.ps1 自动同步这一行，切勿只改别处忘了这里。
const RELEASE_VERSION = "0.5.1";
const RELEASE_TAG = `app-v${RELEASE_VERSION}`;
const RELEASE_ASSETS = `${REPOSITORY}/releases/download/${RELEASE_TAG}`;

const downloads = {
  windows: `${RELEASE_ASSETS}/BiliDanmu_${RELEASE_VERSION}_x64-setup.exe`,
  macos: `${RELEASE_ASSETS}/BiliDanmu_${RELEASE_VERSION}_universal.dmg`,
  linux: `${RELEASE_ASSETS}/BiliDanmu_${RELEASE_VERSION}_amd64.AppImage`,
} as const;


const faqs: Array<{ q: string; a: ReactNode }> = [
  {
    q: "不登录可以使用吗？",
    a: "可以。匿名模式能接收直播弹幕和直播音频；发送弹幕、表情、自动互动，以及收藏夹、稍后再看和评论相关操作需要登录。",
  },
  {
    q: "关闭弹幕窗后直播会断开吗？",
    a: "不会。关闭只是隐藏到系统托盘，连接继续保留；需要真正离开直播间时，使用弹幕窗的退出按钮。",
  },
  {
    q: "支持哪些系统？",
    a: (
      <>
        提供 Windows 10 / 11（x64）、macOS（Universal）和 Linux（x64）版本。安装包统一放在
        <a href={RELEASES} target="_blank" rel="noopener noreferrer">
          GitHub 发布页
        </a>
        。macOS 版暂未签名公证，首次打开需右键应用选择「打开」。
      </>
    ),
  },
  {
    q: "字幕是 AI 自动生成的吗？",
    a: "不是。播放器读取视频已有的字幕轨；没有字幕的视频仍然可以听音频和看评论。",
  },
  {
    q: "怎么更新或反馈？",
    a: (
      <>
        应用会定期检查更新，也可以在「设置 → 关于」手动检查、阅读更新说明并下载安装包。遇到问题，可前往
        <a href={`${REPOSITORY}/issues`} target="_blank" rel="noopener noreferrer">
          GitHub Issues
        </a>
        反馈。
      </>
    ),
  },
];

export function LandingApp({ base, cleanUrls, assetBase }: LandingProps) {
  const link = createLink(base, cleanUrls);
  const asset = createAsset(assetBase);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [liveTab, setLiveTab] = useState(0);
  const [filmOpen, setFilmOpen] = useState(false);
  const { colorMode, setColorMode } = useColorMode();
  const theme = colorMode;
  const [scrolled, setScrolled] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const filmTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (filmOpen && !dialog.open) {
      dialog.showModal();
      videoRef.current?.play().catch(() => {});
    } else if (!filmOpen && dialog.open) {
      dialog.close();
    }
  }, [filmOpen]);

  useEffect(() => {
    return () => {
      videoRef.current?.pause();
    };
  }, []);


  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const root = document.getElementById("landing-root");
    if (!root) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>(".lp-reveal"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || !("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  function closeDialog() {
    setFilmOpen(false);
    videoRef.current?.pause();
    filmTriggerRef.current?.focus();
  }

  return (
    <>
      <a className="lp-skip" href="#main-content">
        跳到主要内容
      </a>

      <header className={`lp-header${scrolled ? " is-scrolled" : ""}`}>
        <div className="lp-shell lp-header-inner">
          <a className="lp-brand" href={link("/")} aria-label="BiliDanmu 首页">
            <span className="lp-brand-mark">
              <img src={asset("logo.svg")} width={30} height={30} alt="" />
            </span>
            <span className="lp-brand-copy">
              <strong>BiliDanmu</strong>
              <small>DESKTOP COMPANION</small>
            </span>
          </a>

          <nav
            id="lp-nav"
            className={`lp-nav${mobileMenu ? " is-open" : ""}`}
            aria-label="主要导航"
          >
            <a href="#desk" onClick={() => setMobileMenu(false)}>
              桌面
            </a>
            <a href="#live" onClick={() => setMobileMenu(false)}>
              直播
            </a>
            <a href="#listen" onClick={() => setMobileMenu(false)}>
              听视频
            </a>
            <a href={link("/guide/quick-start")} onClick={() => setMobileMenu(false)}>
              使用指南
            </a>
            <a
              href={REPOSITORY}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenu(false)}
            >
              GitHub
            </a>
          </nav>

          <div className="lp-header-actions">
            <button
              className="lp-theme-toggle"
              type="button"
              aria-label={theme === "dark" ? "切换到浅色" : "切换到深色"}
              aria-pressed={theme === "dark"}
              onClick={() => setColorMode(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M20.2 14.4A8.4 8.4 0 1 1 9.6 3.8a6.9 6.9 0 0 0 10.6 10.6Z" />
                </svg>
              )}
            </button>
            <a className="lp-button lp-button-sm" href="#download">
              下载 <span aria-hidden="true">↓</span>
            </a>
            <button
              className="lp-menu"
              type="button"
              aria-controls="lp-nav"
              aria-expanded={mobileMenu}
              onClick={() => setMobileMenu((open) => !open)}
            >
              {mobileMenu ? "关闭" : "菜单"}
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="lp-hero">
          <span className="lp-hero-ghost" aria-hidden="true">
            DANMAKU
          </span>

          <div className="lp-shell lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-kicker">
                <span className="lp-live-dot" aria-hidden="true" />
                BILIDANMU / 桌面直播伴侣
              </p>
              <h1>
                桌面归你，
                <br />
                <em>热闹在旁。</em>
              </h1>
              <p className="lp-lede">
                透明弹幕窗、贴边收起、听视频。把 B 站直播和喜欢的声音留在桌面一角，手上的事不用停。
              </p>

              <div className="lp-actions">
                <a className="lp-button" href="#download">
                  下载 Windows 版 <span aria-hidden="true">↓</span>
                </a>
                <button
                  ref={filmTriggerRef}
                  className="lp-button lp-button-ghost"
                  type="button"
                  onClick={() => setFilmOpen(true)}
                >
                  <span className="lp-play" aria-hidden="true">
                    ▶
                  </span>
                  45 秒演示
                </button>
              </div>

              <p className="lp-hero-meta">
                Windows 10/11 · macOS · Linux <span>/</span> 开源 <span>/</span> AGPL-3.0
              </p>
              <a className="lp-hero-guide" href={link("/guide/quick-start")}>
                第一次使用？从这里开始 <span aria-hidden="true">↗</span>
              </a>
            </div>

            <div className="lp-hero-stage" aria-label="播放器与弹幕窗界面预览">
              <p className="lp-stage-caption">LIVE / 桌面层</p>
              <div className="lp-stage-frame">
                <img
                  className="lp-stage-player"
                  src={asset("player-start.webp")}
                  width={2400}
                  height={1520}
                  alt="BiliDanmu 听视频播放器：唱片封面、同步字幕与播放控制"
                  fetchPriority="high"
                />
                <div className="lp-stage-danmaku">
                  <img
                    src={asset("danmaku-content.webp")}
                    width={1040}
                    height={1520}
                    alt="BiliDanmu 弹幕窗口：实时消息、礼物与发送栏"
                  />
                  <span className="lp-stage-badge">弹幕窗</span>
                </div>
              </div>
              <span className="lp-stage-side" aria-hidden="true">
                DESKTOP LAYER / 01
              </span>
            </div>
          </div>

          <div className="lp-shell lp-hero-bottom">
            <span>01 — 桌面的一角</span>
            <a href="#desk">
              向下，看看它怎么工作 <span aria-hidden="true">↓</span>
            </a>
          </div>
        </section>

        <div className="lp-rail">
          <div className="lp-shell lp-rail-inner" aria-label="核心能力">
            {railItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        <section id="desk" className="lp-section lp-reveal">
          <div className="lp-shell lp-desk-grid">
            <div className="lp-copy">
              <p className="lp-index">01 / 桌面层</p>
              <h2>
                留在桌面上，
                <br />
                <em>但不挡路。</em>
              </h2>
              <p className="lp-section-lede">
                弹幕窗可以像一张半透明的便签：想看的时候在，想专心的时候退到一边。
              </p>
              <ul className="lp-points">
                <li>背景不透明度 10–100%，透出后面的表格与文档。</li>
                <li>拖到左、右、顶部边缘自动收起，靠近再展开。</li>
                <li>开启点击穿透，空白处的点击直接落到桌面。</li>
              </ul>
              <a className="lp-link" href={link("/guide/window")}>
                窗口与托盘指南 <span aria-hidden="true">↗</span>
              </a>
            </div>

            <DeskDemo assetBase={assetBase} dark={theme === "dark"} />
          </div>
        </section>

        <section id="live" className="lp-section lp-section-light lp-reveal">
          <div className="lp-shell lp-live-grid">
            <div className="lp-copy">
              <p className="lp-index">02 / 直播消息</p>
              <h2>
                热闹，
                <br />
                <em>也可以有条理。</em>
              </h2>
              <p className="lp-section-lede">
                礼物、弹幕、活动各占一栏；想看的留下，不想看的收起来。
              </p>
              <ul className="lp-points">
                <li>三栏高度可拖动，每一栏独立跟随新消息。</li>
                <li>关键词、用户、礼物类型与电池门槛，按需筛选。</li>
                <li>醒目留言保留完整卡片，也能在弹幕栏看简化行。</li>
              </ul>
              <a className="lp-link" href={link("/guide/features")}>
                查看全部功能 <span aria-hidden="true">↗</span>
              </a>
            </div>

            <div className="lp-live-media">
              <PageTabs
                tabs={liveTabs.map((tab, index) => ({
                  value: String(index),
                  label: tab.label,
                }))}
                activeTab={String(liveTab)}
                onTabChange={(value) => setLiveTab(Number(value))}
                className="lp-live-tabs"
              >
                {liveTabs.map((tab, index) => (
                  <TabContent key={tab.file} value={String(index)}>
                    <div className="lp-media-frame">
                      <img
                        className="is-active"
                        src={asset(tab.file)}
                        width={tab.width}
                        height={tab.height}
                        alt={tab.alt}
                        loading="lazy"
                      />
                    </div>
                  </TabContent>
                ))}
              </PageTabs>
              <p className="lp-media-caption">
                <span>{liveTabs[liveTab]?.caption}</span>
                <span>界面演示</span>
              </p>
            </div>
          </div>
        </section>

        <section id="listen" className="lp-section lp-listen lp-reveal">
          <div className="lp-shell">
            <div className="lp-listen-head">
              <div>
                <p className="lp-index">03 / 听视频</p>
                <h2>
                  眼睛忙的时候，
                  <br />
                  <em>先听。</em>
                </h2>
              </div>
              <div className="lp-listen-aside">
                <p className="lp-section-lede">
                  收藏夹、稍后再看、搜索结果都能变成播放队列。离开播放页，声音继续。
                </p>
                <a className="lp-link" href={link("/guide/listen")}>
                  听视频指南 <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>

            <ListenDemo assetBase={assetBase} />
          </div>
        </section>

        <section id="appearance" className="lp-section lp-appearance lp-reveal">
          <div className="lp-shell lp-appearance-grid">
            <div className="lp-copy">
              <p className="lp-index">04 / 外观</p>
              <h2>
                你的桌面，
                <br />
                <em>你的样子。</em>
              </h2>
              <p className="lp-section-lede">
                浅色、深色或跟随系统；强调色、字体、字号和对比度都能调。改动自动保存，下次打开还是熟悉的样子。
              </p>
              <ul className="lp-points">
                <li>浅色与深色分别设置，深浅各六套预设，修改即时预览。</li>
                <li>强调色、背景、表面、前景和界面字体都能换。</li>
                <li>醒目留言与礼物的金额配色也可逐档指定。</li>
              </ul>
              <a className="lp-link" href={link("/guide/features")}>
                外观设置说明 <span aria-hidden="true">↗</span>
              </a>
            </div>

            <ThemePreview assetBase={assetBase} />
          </div>
        </section>

        <section className="lp-section lp-more lp-reveal">
          <div className="lp-shell">
            <div className="lp-section-head lp-section-head-split">
              <div>
                <p className="lp-index">05 / 顺手的小事</p>
                <h2>
                  日常里，
                  <br />
                  <em>顺手就好。</em>
                </h2>
              </div>
              <a className="lp-link" href={link("/guide/features")}>
                完整功能清单 <span aria-hidden="true">↗</span>
              </a>
            </div>

            <ul className="lp-feature-list">
              {features.map((item, index) => (
                <li key={item.title} className="lp-reveal">
                  <span className="lp-feature-num">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section lp-section-light lp-faq lp-reveal">
          <div className="lp-shell lp-faq-grid">
            <div>
              <p className="lp-index">06 / 再了解一点</p>
              <h2>
                你可能
                <br />
                <em>想知道。</em>
              </h2>
              <p className="lp-section-lede">还有问题？去使用指南，或直接在 GitHub 上问。</p>
            </div>

            <div className="lp-faq-list">
              {faqs.map((item) => (
                <details key={item.q}>
                  <summary>
                    {item.q}
                    <span aria-hidden="true">＋</span>
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="download" className="lp-download lp-reveal">
          <div className="lp-shell lp-download-inner">
            <span className="lp-download-mark">
              <img src={asset("logo.svg")} width={44} height={44} alt="" />
            </span>
            <p className="lp-index">07 / 开始使用</p>
            <h2>
              现在，把直播
              <br />
              放到桌面的一角。
            </h2>
            <div className="lp-download-actions">
              <a className="lp-button" href={downloads.windows}>
                Windows 版 <span aria-hidden="true">↓</span>
              </a>
              <a className="lp-button" href={downloads.macos}>
                macOS 版 <span aria-hidden="true">↓</span>
              </a>
              <a className="lp-button" href={downloads.linux}>
                Linux 版 <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="lp-download-note">
              免费 · 开源 · 无广告
              <a href={RELEASES} target="_blank" rel="noopener noreferrer">
                全部安装包 ↗
              </a>
            </p>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-shell lp-footer-inner">
          <a className="lp-brand" href={link("/")} aria-label="BiliDanmu 首页">
            <span className="lp-brand-mark">
              <img src={asset("logo.svg")} width={30} height={30} alt="" />
            </span>
            <span className="lp-brand-copy">
              <strong>BiliDanmu</strong>
              <small>DESKTOP COMPANION</small>
            </span>
          </a>
          <p className="lp-footer-tagline">为喜欢的直播和声音，留一个位置。</p>
          <div className="lp-footer-links">
            <a href={link("/guide/quick-start")}>使用指南</a>
            <a href={link("/guide/features")}>全部功能</a>
            <a href={REPOSITORY} target="_blank" rel="noopener noreferrer">
              源码
            </a>
            <a href={`${REPOSITORY}/issues`} target="_blank" rel="noopener noreferrer">
              反馈
            </a>
            <a
              href={`${REPOSITORY}/blob/main/LICENSE`}
              target="_blank"
              rel="noopener noreferrer"
            >
              AGPL-3.0
            </a>
          </div>
          <small>独立开源项目，与哔哩哔哩无官方关联。</small>
        </div>
      </footer>

      <dialog
        ref={dialogRef}
        className="lp-film-dialog"
        aria-labelledby="lp-film-title"
        onClose={closeDialog}
        onClick={(event) => {
          if (event.target === dialogRef.current) setFilmOpen(false);
        }}
      >
        <div className="lp-film-head">
          <h2 id="lp-film-title">BiliDanmu · 45 秒，认识一下</h2>
          <button type="button" aria-label="关闭演示视频" onClick={() => setFilmOpen(false)}>
            关闭 ×
          </button>
        </div>
        <video
          ref={videoRef}
          src={asset("product-film.mp4")}
          poster={asset("film-poster.webp")}
          controls
          playsInline
          preload="none"
          aria-label="BiliDanmu 产品演示视频，45 秒，无旁白，含背景音乐"
        />
        <p className="lp-film-note">透明弹幕窗、贴边收起与听视频 · 1080p / 60fps</p>
      </dialog>
    </>
  );
}
