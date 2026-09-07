# react-cordis 架构

## 状态与范围

核心包以 `codex-desktop` 的 `2712dff` 实现为同步基准，底层继续使用 `@deepseek-ai/cordis`。本文描述当前实现；`superpowers` 目录保留历史设计记录。通用 Cordis 启动图在构建期确定，不提供生产 Node catalog 服务、远程模块或 YAML `!!js` 配置。Gallery 的桌面格式包安装是下文描述的独立能力。

## 静态启动链

```text
examples/agent/cordis.yml
  └─ host/plugin-catalog 读取包元数据
      └─ WebBootGraph
          └─ Vite 虚拟 registry（开发）/ cordis.boot.json + chunks（构建）
              └─ client/modules Boot Loader
                  └─ Cordis Context → ctx.uiRenderer.mount(container)
```

`examples/agent/cordis.yml` 是该示例应用唯一的启用来源。catalog 在 Node 构建阶段读取它和每个包的 `yunzhen.client` 元数据，禁用条目在依赖验证前移除。Vite 将图转为 ESM `import()` registry，生产构建同时输出相同内容的 `cordis.boot.json`。浏览器只导入图中条目；缺失的 Dashboard 不会加载其 chunk 或注册路由。

## 包职责

| 包 | 职责 |
| --- | --- |
| `@yunzhen/cordis-client-modules` | WebBootGraph 验证、浏览器 ESM 导入/激活、失败呈现与 UI 挂载。 |
| `@yunzhen/cordis-host-plugin-catalog` | 构建期读取配置和包元数据，验证并排序启动图。 |
| `@yunzhen/cordis-host-vite` | 生成虚拟 registry 和构建清单，开发期配置变化时重载启动图。 |
| `@yunzhen/cordis-ui-slots` | 纯 `SlotMap` / `SlotCore`，支持 `root`、`single`、`list` 与唯一 `root` scope。 |
| `@yunzhen/cordis-ui-renderer` | `ctx.slots` 的 SlotRegistry Service，以及 `ctx.uiRenderer` 的唯一 React 根挂载。 |
| `@yunzhen/cordis-ui-router` | `ctx.routes` 的 RouteRegistry、React Router 适配和 Route 的 Slot owner。 |
| `@yunzhen/cordis-ui-layout` | 可选的三栏布局组件和 `ctx.layout` 面板动作，不依赖 router。 |
| `@examples/app-layout` | Agent、Gallery 示例共享的根路由插件，显式注册 `app-layout`。 |
| `@yunzhen/cordis-ui-i18n` | `ctx.i18n`、浏览器语言识别、用户选择持久化与 i18next React Provider。 |
| `examples/agent/plugins/dashboard`、`settings-layout`、`settings-general`、`settings-appearance`、`settings-language` | Agent 示例的业务插件；通过 Cordis `inject` + `apply` 注册 Route、Slot 或设置贡献，并拥有各自文案资源。 |
| `examples/agent/plugins/settings-layout` | Agent 示例的 `/settings` 路由壳、设置侧栏、底部 Settings 入口与 `ctx.settings.register()`。 |
| `ui/theme` | ThemeRuntime、token 与 DOM 同步；具体设置页面由独立扩展提供。 |

旧的 `core/runtime`、`react/bridge`、`router/react-router` 与 `ui/shell` 分层已不属于当前实现。

## 多语言

`ui/i18n` 内置 `zh` 与 `en`，按浏览器语言优先级匹配已注册语言；用户选择写入 localStorage。`addLanguage({ id, label, fallback })` 可注册更多语言，返回注销函数。renderer 在唯一 React 根部包裹 i18next Provider，语言变更会刷新 Slot 与 Route 组件，语言设置列表也会响应注册和注销。

功能包通过 `ctx.effect(() => ctx.i18n.register('dashboard', { zh: ..., en: ... }))` 注册独立命名空间，卸载时自动移除资源。组件使用 `useTranslation('dashboard')`，跨插件的 Route 导航和设置项使用完整 `labelKey`，例如 `dashboard:dashboard.title`。内置公共文案使用 `common` 命名空间。

旧接口 `register(resources)` 和旧语言标识 `zh-CN/en-US` 已替换。已有应用升级时需要同时迁移词典、调用方和持久化偏好；核心不会把旧偏好自动重写成新标识。

## Vite 接入

```ts
import { cordisWebBoot } from '@yunzhen/cordis-host-vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [cordisWebBoot()] });
```

默认读取 Vite `root` 下的 `cordis.yml`，生成 `virtual:cordis-boot`。调用方可以通过 `configPath` 和 `virtualModuleId` 覆盖；配置路径相对 Vite `root` 解析，也接受绝对路径。应用入口将虚拟模块导出的 `graph`、`registry` 传给 `bootWebApp`。目录解析以配置文件为基准，所以应用需直接声明清单中的插件依赖。

## Slot、Route 与布局

Slots 只有 `root` scope。父项的 `children` 是子 Slot 唯一声明授权；父项移除会递归清理后代声明和贡献，过期 disposer 为无操作。根 renderer 只渲染 `root` Slot，Route 通过 Router 内部的 Slot owner 声明并渲染自己的子 Slots。

Router 是唯一向 `root` Slot 注册的路由宿主。`ctx.routes` 以 `id`、`parentId`、可选 `path` / `index`、`Component` 与页面 `children` Slots 描述路由；`path` 缺省表示不消费 URL 的 Layout Route。跨模块以 `parentId` 建立父子关系，不能修改彼此的 `children` 数组。

router 不依赖布局，也不自动创建业务根路由。Agent、Gallery 的 `@examples/app-layout` 显式注册无路径 `app-layout`，使用 `ctx.layout.Root`；布局组件声明以下 Slots：

```text
app-layout
├─ sidebar (single)
│  ├─ sidebar.navigation (list)
│  └─ sidebar.footer (list)
├─ main (single；Router 的 Outlet 占据)
├─ workbench (single)
└─ shell.overlay (list)
```

Agent 示例的 Dashboard 和 Settings 都是 `app-layout` 的子 Route；命中 Settings 时其 route Sidebar 替换默认应用侧栏。设置扩展通过 `ctx.settings.register()` 同时注册菜单与 `/settings/:id` 页面。`settings-general` 声明 `settings.general.items` 子 Slot，语言设置向其中贡献设置行；Appearance 仍是独立页面。可选 layout 包负责面板开关、拖拽尺寸持久化与响应式折叠。Basic 示例直接使用布局组件和 Slots，不启用 router 或根路由插件。消费项目也可提供自己的布局并注册多个独立根路由。

## Gallery 本地素材与格式扩展边界

Gallery 主进程拥有本地目录授权：只有原生目录选择器能设置素材根目录，扫描结果在主进程内建立素材 id 到授权文件的映射，读取素材和缩略图缓存时都会再次校验该映射。renderer 只能通过 `GalleryMediaApi` 按素材 id 请求字节或缓存，不能提交任意绝对路径，也没有直接文件系统访问权。

Gallery 格式宿主与所有首版格式实现都随应用静态发布。`examples/gallery/cordis.yml` 在构建期固定登记格式宿主、包含原生格式处理器的 assets 插件和 JXL 扩展；生产 renderer 只加载该 Cordis 启动图生成的 ESM chunks。`FormatRegistry.register()` 是这些已打包模块的运行期贡献接口，不是安装器或任意代码加载入口。

Gallery 支持用户从桌面选择 ZIP 格式包安装；这不是 Cordis 运行时启动图加载。主进程校验、解压并持久化包，`gallery-plugin://` 只提供声明入口及其资源；缩略图运行在 sandbox iframe 的 Worker 中，预览运行在 script-only iframe 中。插件只接收当前素材字节，不能获取 Node、IPC、素材路径或 Gallery DOM。包协议、限制和 PSD 验证包见 [桌面格式插件安装设计](superpowers/specs/2026-09-02-gallery-desktop-format-plugin-installation-design.md)。

该例外不提供签名、远程商店、自动更新或 Eagle 插件兼容；通用 Cordis 插件仍然只能来自构建期静态启动图。

## 部署边界

开发期 Vite 进程可读取 `examples/agent/cordis.yml` 生成虚拟 registry；生产环境仅托管 `examples/agent/dist` 的静态文件和 ESM chunks。生产不运行 Node catalog 扫描，不支持 HMR、远程插件、运行时安装或动态运行器。
