import { Link, useParams } from "react-router-dom";

export function DanmakuPage() {
  const { roomId } = useParams();

  return (
    <div className="grid min-h-screen grid-cols-[320px_1fr] bg-slate-950 text-slate-100">
      <aside className="border-r border-white/10 p-6">
        <Link to="/rooms" className="text-sm text-pink-400 hover:text-pink-300">
          ← 返回直播间
        </Link>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h1 className="text-xl font-semibold">房间 {roomId}</h1>
          <p className="mt-2 text-sm text-slate-400">直播间信息、快捷操作与发送统计将在此接入。</p>
        </div>
      </aside>
      <main className="flex flex-col p-6">
        <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-300">
          实时弹幕流占位区域
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/90 p-4 text-slate-300">
          弹幕输入栏与独轮车面板占位区域
        </div>
      </main>
    </div>
  );
}
