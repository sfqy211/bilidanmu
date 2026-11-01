import { useEffect } from "react";
import Layout from "@theme/Layout";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { LandingApp } from "../components/landing/LandingApp";
import "../css/landing.css";
import "../css/landing-demos.css";
import "../css/landing-tailwind.css";

const DESCRIPTION =
  "BiliDanmu 把 B 站直播弹幕与视频装进桌面：透明弹幕窗、贴边收起、直播互动、听视频与语音转字幕，让直播不再占满整块屏幕。";

export default function Home() {
  const base = useBaseUrl("/");
  const assetBase = useBaseUrl("/marketing/");

  useEffect(() => {
    document.body.classList.add("landing-page");
    return () => document.body.classList.remove("landing-page");
  }, []);

  return (
    <Layout
      title="桌面归你，热闹在旁"
      description={DESCRIPTION}
      noFooter
      wrapperClassName="landing-main-wrapper"
    >
      <div id="landing-root" className="landing">
        <LandingApp base={base} cleanUrls assetBase={assetBase} />
      </div>
    </Layout>
  );
}
