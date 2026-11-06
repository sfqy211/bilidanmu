# 安装与启动

本章介绍如何从零开始安装依赖并启动 BiliDanmu 的开发环境。

## 获取 BiliDanmu

### 方式一：下载发布版（推荐普通用户）

前往 [GitHub Releases](https://github.com/sfqy211/bilidanmu/releases) 下载对应平台的安装包：

| 平台 | 产物 |
| --- | --- |
| Windows x64 | `.exe`（NSIS）或 `.msi` |
| macOS Universal | `.dmg`（Apple Silicon + Intel） |
| Linux x64 | `.AppImage` |

双击安装即可使用。macOS 版暂未签名公证，首次打开需右键应用选择「打开」。

### 方式二：从源码构建（开发者）

```bash
git clone https://github.com/sfqy211/bilidanmu.git
cd bilidanmu
npm ci
```

## 环境要求

| 组件 | 最低版本 | 说明 |
| --- | --- | --- |
| Node.js | 18+ | 前端构建与包管理（文档站要求 20+） |
| Rust | 最新 stable | 通过 [rustup](https://rustup.rs/) 安装 |
| Windows | 10+ | 需要 WebView2 运行时（Win11 自带） |
| 包管理器 | npm | 仓库带 `package-lock.json`，统一用 `npm ci` |

> **提示**：首次安装 Rust 后，请确保已添加目标三元组：
>
> ```bash
> rustup target add x86_64-pc-windows-msvc
> ```

Linux 需要 `libwebkit2gtk-4.1-dev`、`libssl-dev`、`libayatana-appindicator3-dev` 等系统依赖（CI 使用的完整列表见 `.github/workflows/publish-tauri.yml`）。

## 安装依赖

```bash
npm ci
```

该命令会按锁文件安装前端依赖。Rust 依赖在首次 `tauri dev` / `tauri build` 时由 Cargo 自动下载编译。

## 启动开发

```bash
npm run dev
```

该命令会同时启动：

1. **Vite 前端开发服务器**（固定 `localhost:3000`，`strictPort`，支持热更新）
2. **Tauri 桌面窗口**（加载前端并桥接 Rust 后端）

启动后你将看到一个原生桌面窗口，即可开始开发与调试。

## 常用命令速查

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 完整开发模式（前端 + Tauri） |
| `npm run dev:mock` | 同上，并启用虚拟直播间（无需真实直播间） |
| `npm run dev:gift` | 同上，并开启礼物打赏编译特性 |
| `npm run dev:renderer` | 仅启动前端（Vite），适合纯 UI 调试 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build` | 构建发布包（前端 + Tauri 安装包） |
| `npm run build:gift` | 构建带礼物打赏的发布包 |
| `cargo check` | 在 `src-tauri/` 下运行 Rust 编译检查 |
| `.\scripts\bump-version.ps1 <version>` | 更新所有版本号 |

## 构建发布包

```bash
npm run build
```

构建产物位于 `src-tauri/target/release/bundle/`，包含当前平台的安装包与可执行文件。

> **提示**：推送 `main` 分支且 `tauri.conf.json` 版本号变更时，GitHub Actions 会自动构建 Windows / macOS / Linux 三平台安装包并发布到 [Releases](https://github.com/sfqy211/bilidanmu/releases)，标签为 `app-v<version>`。

## 文档站

```bash
cd docs
npm ci
npm run dev     # 本地预览
npm run build   # 构建静态站点到 docs/build
```

推送到 `main` 且改动 `docs/**` 时，GitHub Actions 会自动部署到 <https://sfqy211.github.io/bilidanmu/>。

## 故障排除

### WebView2 运行时缺失

若启动报错 `WebView2 not found`，请安装 [WebView2 运行时](https://developer.microsoft.com/microsoft-edge/webview2/)。

### Rust 编译失败

- 确认已安装 [Microsoft C++ 生成工具](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（Desktop development with C++）
- 确认 `rustup` 已配置 `stable` 工具链
- 链接阶段报 `sherpa-onnx-c-api` 找不到时，删除 `src-tauri/target/sherpa-onnx-prebuilt` 让其重新下载（CI 每次构建都会做这一步）

### 端口占用

Vite 配置了 `strictPort: true`，`localhost:3000` 被占用时会直接启动失败而不是换端口。请先释放该端口。

继续阅读 [功能总览](/guide/features) 了解 BiliDanmu 的全部功能。
