# 四方上行 Chat Client

一个极简的桌面端对话客户端，基于 Electron + Vite + React + TypeScript 构建。只保留当前会话的临时上下文记忆，关闭窗口即清空对话历史。

## 功能

- 单会话对话：连续提问自动保留上下文，点击“新对话”或关闭窗口即清空。
- 流式回复：通过 SSE 流式接收模型输出，实时显示。
- 灵活配置：在设置中可配置接口密钥、API 请求地址、选用模型，并支持一键检测联通。
- 本地持久化设置：设置项保存到本地，重启后无需重新填写。

## 技术栈

- 桌面容器：Electron
- 前端框架：React 18 + TypeScript
- 构建工具：Vite 5 + vite-plugin-electron
- 样式：原生 CSS
- 图标：lucide-react

## 项目结构

```
./
├── electron/
│   ├── main.ts          # Electron 主进程，代理 API 请求、解析 SSE
│   └── preload.ts       # 安全暴露给渲染进程的 IPC API
├── shared/
│   ├── types.ts         # ApiConfig 等共享类型
│   └── config.ts        # 默认 API 地址、模型、应用名称等
├── src/
│   ├── components/      # Chat、Message、Settings 组件
│   ├── hooks/           # useChat、useApiConfig
│   ├── types/           # 类型声明
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── readme.md
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm

### 安装依赖

```bash
cd .
npm install
```

如果在某些网络环境下安装 Electron 二进制时遇到证书错误，可尝试：

```powershell
$env:NODE_OPTIONS='--use-system-ca'
npm install
```

### 启动开发环境

```bash
npm run dev
```

运行后会自动打开 Electron 窗口。前端页面由 Vite dev server 提供，主进程和 preload 代码修改后会自动热重载。

### 配置 API

1. 点击右上角“设置”按钮。
2. 填写接口密钥、API 请求地址和选用模型。
   - 默认 API 地址：`https://api.kimi.com/coding/v1`
   - 默认模型：`kimi-code-plan`
3. 点击“检测联通”验证接口是否可用。
4. 点击“保存”后关闭设置面板，即可在输入框发送消息。

### 构建生产包

```bash
npm run build
```

该命令会先进行 TypeScript 类型检查，然后构建前端产物、主进程和 preload 脚本。打包分发可继续使用 `electron-builder` 等工具。

## 配置说明

- 默认模型和 API 地址：`shared/config.ts`
- 模型建议列表：`shared/config.ts` 中的 `MODEL_SUGGESTIONS`
- 应用名称和界面显示名称：`shared/config.ts` 中的 `APP_NAME` 和 `MODEL_DISPLAY_NAME`

## 注意事项

- 当前 API 调用按 OpenAI 兼容格式实现：`/chat/completions` + SSE 流式。
- 如果目标 API 没有 `/models` 端点，设置中的“检测联通”可能会失败，但实际的聊天接口仍可能可用。
- 接口密钥保存在本地 `localStorage` 中，仅用于本地调用；对话历史不持久化。

## 开源协议

MIT
### 构建生产包

```bash
npm run build
```

该命令会先进行 TypeScript 类型检查，然后构建前端产物、主进程和 preload 脚本。打包分发可继续使用 `electron-builder` 等工具。
## 打包为 Windows 安装程序

项目已集成 `electron-builder`，配置文件为 `electron-builder.yml`。

```bash
# 打包为当前平台安装程序（Windows 下会生成 .exe 安装包）
npm run dist

# 仅打包 Windows 版本
npm run dist:win
```

打包完成后产物位于 `release/` 目录：

- `release/win-unpacked/`：免安装的绿色版，可直接运行其中的 `四方上行 Chat Client.exe`。
- `release/四方上行 Chat Client Setup 0.1.0.exe`：Windows 安装程序（以管理员身份运行打包命令时才能成功生成）。

### 常见问题

#### 打包时报 winCodeSign 解压失败

Windows 非管理员环境打包安装程序时，`electron-builder` 下载的 `winCodeSign` 包含 macOS 符号链接，7-Zip 无权创建会导致失败：

```
ERROR: Cannot create symbolic link : 客户端没有所需的特权。
```

解决方案：
1. 以管理员身份打开 PowerShell 或终端，重新执行 `npm run dist:win`。
2. 或开启 Windows 开发者模式（设置 → 隐私和安全性 → 开发者模式 → 打开），然后重新打包。

> 即使安装程序生成失败，`release/win-unpacked/` 下的绿色版 `.exe` 通常已经可用，可以直接运行测试。

#### 默认图标

未配置自定义图标时，`electron-builder` 会使用 Electron 默认图标。正式分发前，建议在 `electron-builder.yml` 中设置 `win.icon` 并准备好 ICO 格式图标文件。

```yaml
win:
  target: nsis
  icon: build/icon.ico
```
