# react-cordis

基于 `@deepseek-ai/cordis` 的 React 插件化应用实践。通过插件提供服务、贡献 UI，并由应用配置决定启用哪些能力。

项目将启动、插槽、路由、国际化和主题拆成独立包，业务页面与布局放在示例插件中。当前以源码工作区的方式开发和验证，各包均为 private；接入可从仓库中的示例开始。

## 快速开始

环境要求：Node.js 22.18+（22.x）或 24.12+（24.x），pnpm 11.26.0（仓库指定版本）。

```bash
git clone https://github.com/yunzhencc/react-cordis.git
cd react-cordis
pnpm install
pnpm start
```

`pnpm start` 默认启动 Router 示例，访问终端输出的本地地址。

| 示例 | 启动命令 | 内容 |
| --- | --- | --- |
| [Basic](examples/basic) | `pnpm start:basic` | 最小启动链与根插槽，不依赖路由。 |
| [Router](examples/router) | `pnpm start:router` | 路由、三栏布局、工作台、设置扩展、主题与语言切换。 |
| [i18n](examples/i18n) | `pnpm start:i18n` | 命名空间、语言包注册、翻译回退与语言偏好持久化。 |

## 核心能力

| 包 | 职责 |
| --- | --- |
| `@react-cordis/boot-config` | 读取 `cordis.yml` 和插件包元数据，校验并排序启动图。 |
| `@react-cordis/vite` | 生成虚拟模块与构建清单，接入依赖扫描和开发期配置刷新。 |
| `@react-cordis/boot` | 导入、激活插件，挂载 UI，并在启动失败时清理已创建的插件。 |
| `@react-cordis/slots` | 插槽类型契约、声明归属、注册顺序与清理规则。 |
| `@react-cordis/renderer` | React 插槽渲染、挂载与逐项渲染异常隔离。 |
| `@react-cordis/router` | 路由注册、React Router 适配与页面渲染异常隔离。 |
| `@react-cordis/i18n` | 国际化服务、语言包、命名空间、回退与 React Provider。 |
| `@react-cordis/theme` | 主题偏好、系统主题跟随、持久化与首屏初始化脚本。 |

应用决定页面布局与业务服务。基础 router 不提供侧栏或设置页；这些能力由 Router 示例中的业务插件实现。

## 最小插件接入

以 [Basic 示例](examples/basic) 为例，插件通过 `apply(ctx)` 注册 UI，通过 `inject` 声明需要的服务：

```tsx
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@react-cordis/renderer';

export const inject = ['slots'];

export function apply(ctx: Context) {
  ctx.slots.register({ name: 'root' }, () => (
    <main>
      <h1>Hello Cordis</h1>
    </main>
  ));
}
```

插件的 `package.json` 通过根入口导出插件，并声明依赖的插件包：

```json
{
  "name": "@examples/basic-page",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.tsx"
  },
  "dependencies": {
    "@deepseek-ai/cordis": "^4.0.2",
    "@react-cordis/renderer": "workspace:*",
    "react": "^19.2.8"
  },
  "cordis": {
    "inject": ["@react-cordis/renderer"]
  }
}
```

应用在自己的 `package.json` 中直接声明清单里的插件依赖，再用 `cordis.yml` 启用它们：

```yaml
- id: renderer
  name: '@react-cordis/renderer'
- id: page
  name: '@examples/basic-page'
```

这里的两类依赖各有用途：`cordis.inject` 使用**包名**，用于启动图校验；代码中的 `inject` 使用**服务名**，决定 Cordis 何时执行 `apply()`。插件注册和需要清理的副作用应放在 `apply()` 或 `ctx.effect()` 中。

应用还需在 [Vite 配置](examples/basic/vite.config.ts) 中启用 `cordisWebBoot()`，并在 [浏览器入口](examples/basic/src/main.tsx) 将虚拟模块导出的 `graph`、`registry` 交给 `bootWebApp()`。React 应用根包需声明 `react` 与 `react-dom`，供 React 插件解析和预构建。

`root` 是单项插槽，只允许一个贡献；多个区域应由根插件声明子插槽。业务插槽通过声明合并扩展 `SlotContracts`，名称、类型与注册参数可在编译期检查，详见[插槽类型契约](docs/architecture.md#插槽类型契约)。

## 开发与构建

```bash
pnpm test
pnpm typecheck
pnpm lint

# 构建指定示例，输出到该示例的 dist 目录
pnpm --filter @examples/basic build
pnpm --filter @examples/router build
pnpm --filter @examples/i18n build
```

Vite 首轮依赖扫描会覆盖启动虚拟模块中的插件入口。修改 `cordis.yml` 或启用插件的 `cordis.inject` 后会重新校验配置并整页刷新，页面临时状态会重置。

修改 `exports`、安装此前缺失的插件或更换包链接目标后，需要重启开发服务；入口已被预构建时加 `--force`：

```bash
pnpm --filter @examples/router exec vite --force
```

## 能力边界

- 插件集合在构建期确定，生产部署使用静态文件与 ESM chunks；不提供运行时安装、远程插件或插件市场。
- Slot 支持 `single`、`list` 与 `root` scope，子插槽由拥有它的父项声明；不提供任意 props 注入或会话级 scope。
- 渲染异常按 Slot 注册项或路由页面隔离，故障区域显示空占位并记录日志。边界不自动重试，也不捕获普通事件回调和渲染之外的异步异常；Slot 装配错误会继续抛出。
- 插件共享浏览器执行环境，渲染异常隔离不是不可信代码的安全沙箱。

## 文档

- [架构与插件契约](docs/architecture.md)
- [国际化使用说明](packages/i18n/README.md)
- [主题使用说明](packages/theme/README.md)
