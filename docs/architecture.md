# react-cordis 架构

## 状态与范围

核心包以 `codex-desktop` 的 `2712dff` 实现为同步基准，底层继续使用 `@deepseek-ai/cordis`。本文描述当前实现；`superpowers` 目录保留历史设计记录。通用 Cordis 启动图在构建期确定，不提供生产 Node 配置解析服务、远程模块或 YAML `!!js` 配置。

示例分为 Basic（最小启动与插槽）、Router（布局、路由、工作台及设置扩展）和 i18n（语言切换、命名空间、额外语言包与回退）。

## 静态启动链

```text
examples/router/cordis.yml
  └─ boot-config 读取包元数据
      └─ WebBootGraph
          └─ Vite 虚拟 registry（开发）/ cordis.boot.json + chunks（构建）
              └─ boot Boot Loader
                  └─ Cordis Context → ctx.uiRenderer.mount(container)
```

`examples/router/cordis.yml` 是该示例应用唯一的启用来源。`boot-config` 在 Node 构建阶段读取它和每个包的 `cordis.inject` 包依赖元数据，禁用条目在依赖验证前移除。Vite 将图转为 ESM `import()` registry，生产构建同时输出相同内容的 `cordis.boot.json`。浏览器只导入图中条目；缺失的 Dashboard 不会加载其 chunk 或注册路由。

插件通过 `exports["./client"]` 提供浏览器入口，`package.json` 的可选 `cordis.inject` 声明包名依赖，用于校验和排序启动图；没有包依赖时可省略整个 `cordis` 字段。代码中的 `export const inject` 仍声明 Cordis 服务名依赖。

```json
"cordis": {
  "inject": ["@react-cordis/i18n"]
}
```

原 `yunzhen.client` 元数据已替换，不再使用 `platform` 和 `immediately`，所有启用插件并发导入，模块到达后立即创建 Cordis 插件；代码中的服务 `inject` 决定何时执行 `apply()`。包级依赖仍用于启动图校验与排序，但不串行等待激活。启动器等待所有已创建插件的生命周期工作稳定，确认没有激活失败或缺失服务后才挂载 UI。失败时清理已创建插件，迟到的模块不会再创建插件。

插件注册和可清理副作用应放在 `apply()` 或 `ctx.effect()` 中；ESM 导入不能取消，模块顶层副作用不属于插件回滚范围。

## 包职责

`packages/` 采用单层目录，目录名与 `@react-cordis/*` 的包名后缀一致，例如 `packages/boot` 对应 `@react-cordis/boot`。`boot-config` 和 `vite` 属于 Node 构建工具。

```text
packages/
├── boot
├── boot-config
├── vite
├── i18n
├── renderer
├── router
├── slots
└── theme
```

| 包 | 职责 |
| --- | --- |
| `@react-cordis/boot` | WebBootGraph 验证、浏览器 ESM 导入/激活、失败呈现与 UI 挂载。 |
| `@react-cordis/boot-config` | 构建期读取配置和包元数据，验证并排序启动图。 |
| `@react-cordis/vite` | 生成虚拟 registry 和构建清单，开发期配置变化时重载启动图。 |
| `@react-cordis/slots` | 纯 `SlotMap` / `SlotCore`，支持 `root`、`single`、`list` 与唯一 `root` scope。 |
| `@react-cordis/renderer` | `ctx.slots` 的 SlotRegistry Service，以及 `ctx.uiRenderer` 的 React 根挂载与卸载清理，不依赖 i18n。 |
| `@react-cordis/router` | `ctx.routes` 的 RouteRegistry、React Router 适配和 Route 的 Slot owner，不提供导航或侧栏 UI。 |
| `@examples/router-app-layout` | Router 示例自己的三栏布局、面板尺寸持久化与响应式策略，注册根路由并提供业务服务 `ctx.appLayout`。 |
| `@react-cordis/i18n` | `ctx.i18n`、浏览器语言识别、用户选择持久化与 i18next React Provider。 |
| `examples/router/plugins/dashboard`、`settings-layout`、`settings-general`、`settings-appearance`、`settings-language` | Router 示例的业务插件；通过 Cordis `inject` + `apply` 注册 Route、Slot 或设置贡献，并拥有各自文案资源。 |
| `examples/router/plugins/settings-layout` | Router 示例的 `/settings` 路由壳、设置侧栏、底部 Settings 入口与 `ctx.settings.register()`。 |
| `packages/theme` | 可配置的主题偏好、持久化、跨标签同步与 DOM 标记；提供首屏脚本生成器，不依赖 renderer，不内置皮肤或字号。 |

旧的 `core/runtime`、`react/bridge`、`router/react-router` 与 `ui/shell` 分层已不属于当前实现。

## 多语言

`packages/i18n` 内置 `zh` 与 `en`，按浏览器语言优先级匹配已注册语言；用户选择写入 localStorage，默认 key 为 `react-cordis:locale`，可通过 i18n 插件的 `config.storageKey` 覆盖。`addLanguage({ id, label, fallback })` 可注册更多语言，返回注销函数。应用在业务根组件中显式包裹 `I18nProvider`：Router 示例由 `app-layout` 接入，国际化示例由 `page` 接入。语言变更会刷新 Provider 下的 Slot 与 Route 组件，语言设置列表也会响应注册和注销。

功能包通过 `ctx.effect(() => ctx.i18n.register('dashboard', { zh: ..., en: ... }))` 注册独立命名空间，卸载时自动移除资源。组件使用 `useTranslation('dashboard')`；Dashboard 自己向导航 Slot 注册翻译后的链接，跨插件设置项使用完整 `labelKey`。i18n 不内置业务文案或固定的公共命名空间回退；语言包、资源生命周期与事件职责见 [i18n 使用说明](../packages/i18n/README.md)。

旧接口 `register(resources)` 和旧语言标识 `zh-CN/en-US` 已替换。已有应用升级时需要同时迁移词典、调用方和持久化偏好；核心不会把旧偏好自动重写成新标识。

例如，在 `cordis.yml` 中为同源应用配置独立的存储 key：

```yaml
- id: i18n
  name: '@react-cordis/i18n'
  config:
    storageKey: 'my-app:locale'
```

未配置时使用 `react-cordis:locale`；不会自动迁移旧 key `@yunzhen/cordis-ui-i18n:locale`，需要沿用旧偏好时可显式配置为该值。

`pnpm start:i18n` 启动独立国际化示例，使用 `examples:i18n:locale` 隔离其语言偏好。`examples/i18n` 只启用 i18n、renderer 和三个示例插件：`page` 与 `greeting` 各自注册中英文命名空间；`locale-ja` 注册日语并向两个命名空间补充翻译，故意省略 greeting 正文以演示英文回退。语言选择使用原生下拉框，刷新后恢复偏好，不依赖 router、layout 或 settings。

## 主题

`@react-cordis/theme` 提供 `ctx.theme`，默认支持 light/dark/system，以只读快照和订阅向消费方暴露状态。应用可配置 `storageKey`、`defaultTheme`、`attribute` 和 `enableColorScheme`，详见 [theme 使用说明](../packages/theme/README.md)。

Router 示例沿用旧主题存储键；Vite 从同一份 `cordis.yml` 读取配置，通过 `getThemeScript()` 在 HTML head 注入首屏脚本。配色、字体栈与页面基础样式由 `examples/router/src/styles.css` 提前加载，示例字号由 CSS 固定为 14px，settings-appearance 仅提供主题选择。主题核心不注入皮肤，也不依赖 React 或 renderer。

## Vite 接入

```ts
import { cordisWebBoot } from '@react-cordis/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [cordisWebBoot()] });
```

默认读取 Vite `root` 下的 `cordis.yml`，生成 `virtual:cordis-boot`。调用方可以通过 `configPath` 和 `virtualModuleId` 覆盖；配置路径相对 Vite `root` 解析，也接受绝对路径。应用入口将虚拟模块导出的 `graph`、`registry` 传给 `bootWebApp`。目录解析以配置文件为基准，所以应用需直接声明清单中的插件依赖。

## Slot、Route 与布局

Slots 只有 `root` scope。父项的 `children` 是子 Slot 唯一声明授权；父项移除会递归清理后代声明和贡献，过期 disposer 为无操作。声明或注册通知抛错时，会回滚本次条目及其子声明和后代贡献，并重新通知恢复后的状态；清理先完成状态移除，再通知所有观察者，最后抛出首个错误。根 renderer 只渲染 `root` Slot，Route 通过 Router 内部的 Slot owner 声明并渲染自己的子 Slots。`ctx.uiRenderer.mount(container)` 返回手动卸载函数；renderer 插件卸载时也会自动卸载其 React 根，重复清理无副作用。

Router 是唯一向 `root` Slot 注册的路由宿主。`ctx.routes` 以 `id`、`parentId`、可选 `path` / `index`、`Component` 与页面 `children` Slots 描述路由；`path` 缺省表示不消费 URL 的 Layout Route。跨模块以 `parentId` 建立父子关系，不能修改彼此的 `children` 数组。Route 注册通知抛错时，会撤销本次路由及其后代，并通知恢复后的快照；其他路由保留。子树移除先完成状态清理与 epoch 更新，再通知订阅者，避免误删通知期间创建的替代路由。

router 不依赖布局或 i18n，也不自动创建业务根路由、侧栏或 `main` Slot 内容。业务布局自行渲染 React Router 的 `<Outlet />`。布局由业务应用决定，基础包不提供统一布局插件。Router 示例的 `@examples/router-app-layout` 拥有自己的布局组件，显式注册无路径 `app-layout`；其组件声明以下 Slots：

```text
app-layout
├─ sidebar (single)
│  ├─ sidebar.navigation (list)
│  └─ sidebar.footer (list)
├─ main (single；app-layout 注册 Outlet)
├─ workbench (single)
└─ shell.overlay (list)
```

Router 示例的 Dashboard 和 Settings 都是 `app-layout` 的子 Route；app-layout 拥有默认侧栏及其样式，通过业务侧的 TypeScript 声明合并为 `RouteDefinition` 扩展 `Sidebar` 字段，并根据匹配路由选择侧栏；命中 Settings 时显示设置侧栏，基础 router 不解释该字段。Dashboard 向 `sidebar.navigation` 注册自己的 NavLink，菜单顺序由 Slot 的 `order` 决定。设置扩展通过 `ctx.settings.register()` 同时注册菜单与 `/settings/:id` 页面；注册或通知失败时回滚设置项及其路由，保留其他设置项。`settings-general` 声明 `settings.general.items` 子 Slot，语言设置向其中贡献设置行；Appearance 仍是独立页面。Router 的 app-layout 业务插件负责面板开关、拖拽尺寸持久化与响应式折叠，Dashboard 通过 `ctx.appLayout` 操作工作区。Basic 示例直接向 root Slot 注册自己的页面，不加载 i18n、布局或路由插件。消费项目也可提供自己的布局并注册多个独立根路由。

## 部署边界

开发期 Vite 进程可读取 `examples/router/cordis.yml` 生成虚拟 registry；生产环境仅托管 `examples/router/dist` 的静态文件和 ESM chunks。生产不运行 Node 配置扫描，不支持 HMR、远程插件、运行时安装或动态运行器。应用卸载时，即使 renderer 的卸载函数抛错，boot 仍会完成插件清理后再报告错误。
