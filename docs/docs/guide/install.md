# 安装与启动

本章介绍如何从零开始安装依赖并启动 BiliDanmu 的开发环境。

## 获取 BiliDanmu

### 方式一：下载发布版（推荐普通用户）

前往 [GitHub Releases](https://github.com/sfqy211/bilidanmu/releases) 下载最新的 Windows 安装包（`.msi` 或 `.nsis`），双击安装即可使用。

### 方式二：从源码构建（开发者）

```bash
git clone https://github.com/sfqy211/bilidanmu.git
cd bilidanmu
```

## 环境要求

| 组件 | 最低版本 | 说明 |
| --- | --- | --- |
| Node.js | 18+ | 前端构建与包管理 |
| Rust | 最新 stable | 通过 [rustup](https://rustup.rs/) 安装 |
| Windows | 10+ | 需要 WebView2 运行时（Win11 自带） |
| pnpm / npm | — | 包管理器（推荐 pnpm） |

> **提示**：首次安装 Rust 后，请确保已添加 `x86_64-pc-windows-msvc` 目标：
>
> ```bash
> rustup target add x86_64-pc-windows-msvc
> ```

## 安装依赖

```bash
npm install
```

该命令会安装前端所有 npm 依赖。Rust 依赖会在首次 `tauri dev` / `tauri build` 时由 Cargo 自动下载编译。

## 启动开发

```bash
npm run dev
```

该命令会同时启动：

1. **Vite 前端开发服务器**（默认 `localhost:3000`，支持热更新）
2. **Tauri 桌面窗口**（加载前端并桥接 Rust 后端）

启动后你将看到一个原生桌面窗口，即可开始开发与调试。

## 常用命令速查

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 完整开发模式（前端 + Tauri） |
| `npm run dev:renderer` | 仅启动前端（Vite），适合纯 UI 调试 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build` | 构建发布包（前端 + Tauri 安装包） |
| `cargo check` | 在 `src-tauri/` 下运行 Rust 编译检查 |
| `.\scripts\bump-version.ps1 <version>` | 更新所有版本号 |

## 构建发布包

```bash
npm run build
```

构建产物位于 `src-tauri/target/release/bundle/`，包含：

- `.msi` / `.nsis` 安装包
- `.exe` 可执行文件

> **提示**：推送 `main` 分支且 `tauri.conf.json` 版本号变更时，GitHub Actions 会自动构建并发布到 [Releases](https://github.com/sfqy211/bilidanmu/releases)。

## 故障排除

### WebView2 运行时缺失

若启动报错 `WebView2 not found`，请安装 [WebView2 运行时](https://developer.microsoft.com/microsoft-edge/webview2/)。

### Rust 编译失败

- 确认已安装 [Microsoft C++ 生成工具](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（Desktop development with C++）
- 确认 `rustup` 已配置 `stable` 工具链

### 端口占用

若 `localhost:3000` 被占用，Vite 会自动尝试下一个端口，Tauri 配置会同步更新。

继续阅读 [功能总览](/guide/features) 了解 BiliDanmu 的全部功能。
