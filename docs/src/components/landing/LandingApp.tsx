import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import { DeskDemo } from "./demos/DeskDemo";
import { ListenDemo } from "./demos/ListenDemo";
import { createAsset, createLink, type LandingProps } from "./links";

const REPOSITORY = "https://github.com/sfqy211/bilidanmu";
const RELEASES = `${REPOSITORY}/releases/latest`;

// scripts/bump-version.ps1 同步此版本，下载资产名称包含版本号。
const RELEASE_VERSION = "0.5.1";
const RELEASE_TAG = `app-v${RELEASE_VERSION}`;
const RELEASE_ASSETS = `${REPOSITORY}/releases/download/${RELEASE_TAG}`;

const downloads = [
  {
    name: "Windows",
    detail: "10 / 11 · x64",
    file: `BiliDanmu_${RELEASE_VERSION}_x64-setup.exe`,
  },
  {
    name: "macOS",
    detail: "Intel / Apple Silicon",
    file: `BiliDanmu_${RELEASE_VERSION}_universal.dmg`,
  },
  {
    name: "Linux",
    detail: "x64 · AppImage",
    file: `BiliDanmu_${RELEASE_VERSION}_amd64.AppImage`,
  },
];

export function LandingApp({ base, cleanUrls, assetBase }: LandingProps) {
  const link = createLink(base, cleanUrls);
  const asset = createAsset(assetBase);

  return (
    <>
      <a className="lp-skip" href="#download">
        跳到下载
      </a>
      <header className="lp-header">
        <div className="lp-shell lp-header-inner">
          <a className="lp-brand" href={link("/")} aria-label="BiliDanmu 首页">
            <img src={asset("logo.svg")} width={30} height={30} alt="" />
            <strong>BiliDanmu</strong>
          </a>
          <nav className="lp-nav" aria-label="主要导航">
            <a href={link("/guide/quick-start")}>
              使用指南 <ArrowUpRight size={13} />
            </a>
            <a href={REPOSITORY} target="_blank" rel="noopener noreferrer">
              GitHub <ArrowUpRight size={13} />
            </a>
          </nav>
          <a className="lp-button lp-header-download" href="#download">
            下载 <ArrowDownToLine size={15} />
          </a>
        </div>
      </header>

      <main id="main-content">
        <DeskDemo />
        <ListenDemo assetBase={assetBase} />

        <section id="download" className="lp-download">
          <div className="lp-shell">
            <p className="lp-eyebrow">
              BiliDanmu <span>v{RELEASE_VERSION}</span>
            </p>
            <div className="lp-download-heading">
              <h2>
                给喜欢的直播，
                <br />
                留个位置。
              </h2>
              <p>免费、开源。现在放到你的桌面上。</p>
            </div>
            <div className="lp-downloads">
              {downloads.map((item) => (
                <a
                  key={item.name}
                  href={`${RELEASE_ASSETS}/${item.file}`}
                  className="lp-download-link"
                >
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <ArrowDownToLine size={22} />
                </a>
              ))}
            </div>
            <div className="lp-install-notes">
              <p>macOS 首次打开需右键应用，选择「打开」。</p>
              <a href={RELEASES} target="_blank" rel="noopener noreferrer">
                全部版本与更新记录 <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-shell lp-footer-inner">
          <span>BiliDanmu · AGPL-3.0</span>
          <p>独立开源项目，与哔哩哔哩无官方关联。</p>
          <a
            href={`${REPOSITORY}/issues`}
            target="_blank"
            rel="noopener noreferrer"
          >
            反馈 <ArrowUpRight size={13} />
          </a>
        </div>
      </footer>
    </>
  );
}
