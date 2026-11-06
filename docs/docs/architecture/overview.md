# 架构总览

BiliDanmu 采用 **前后端分离** 的架构设计，前端基于 React，后端基于 Rust，通过 Tauri 的 IPC 机制通信。

## 架构图

```mermaid
graph TB
    subgraph 前端["前端 (React)"]
        P["Pages / Components"]
        H["Hooks"]
        S["Zustand Stores"]
    end

    subgraph 后端["后端 (Rust)"]
        C["Commands"]
        B["Bili Protocol"]
        STT["STT Module"]
        Proxy["Stream Proxy"]
        Win["窗口管理<br/>dock / stealth / state"]
        Tray["Tray"]
    end

    P --> H
    H --> S
    S <-->|"Tauri IPC"| C
    C --> B
    C --> STT
    C --> Proxy
    C --> Win
    C --> Tray
```

## 分层设计

| 层 | 职责 | 技术 |
| --- | --- | --- |
| 表现层 | 页面、组件、交互 | React 18, TailwindCSS, Radix UI |
| 状态层 | 全局状态、数据流 | Zustand 5 |
| 桥接层 | 前端与后端通信 | Tauri IPC（`src/lib/tauri.ts`） |
| 业务层 | B 站协议、数据处理 | Rust |
| 持久化层 | 本地数据存储 | SQLite, tauri-plugin-store |

## 窗口模型

BiliDanmu 只有两个常驻窗口，两者互斥：

| 窗口 | label | 职责 |
| --- | --- | --- |
| 主窗口 | `main` | 房间列表、账号、听视频、设置 |
| 弹幕窗口 | `danmaku` | 弹幕显示与发送；运行时创建，切房复用同一个窗口 |

窗口的复杂行为尽量下沉到 Rust：贴边吸附几何、仅输入框模式尺寸、隐身显隐判定、位置尺寸持久化都在后端计算，前端只切换渲染形态并订阅事件。这样做是因为这些操作需要平台级能力（窗口几何、全局光标位置、点击穿透），通过 WebView 无法可靠实现。

## 核心设计原则

1. **关注点分离**：前端专注 UI 与交互，后端专注协议与数据处理
2. **最小权限**：前端通过 IPC 调用后端能力，不直接访问网络 / 文件系统（CSP 只放开本地代理与 IPC）
3. **模块化**：功能按模块划分，便于独立开发与测试
4. **性能优先**：关键路径（弹幕渲染、音频播放）优先优化性能

## 数据流

详见 [数据流设计](/architecture/dataflow)。
