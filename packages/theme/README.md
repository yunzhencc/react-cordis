# @react-cordis/theme

管理浏览器文档的主题偏好、持久化、系统主题跟随与 DOM 标记。插件不依赖 React 或 renderer，不提供配色、字号、页面布局或设置界面。

```yaml
- id: theme
  name: '@react-cordis/theme'
  config:
    storageKey: 'my-app:theme'
    defaultTheme: system
    attribute: data-theme
    enableColorScheme: true
```

配置可全部省略：默认存储键为 `react-cordis:theme`，默认偏好为 `system`，默认标记为 `data-theme`，默认同步浏览器 `color-scheme`。`attribute` 支持 `class` 或小写 `data-*` 属性；`class` 模式只管理 `light` / `dark` 两个类名，保留其他类。主题仅支持 `light`、`dark`、`system`。

配置和 `setTheme()` 入参会进行运行时校验。存储值非法或被移除时回退到 `defaultTheme`；localStorage 不可用时仍可在当前页面切换主题。同源标签页共享同一存储键时自动同步，不同应用可通过不同键隔离偏好。

## 使用

消费插件声明 `inject = ['theme']`，通过 `ctx.theme` 使用服务：

```ts
const { preference, resolvedTheme } = ctx.theme.snapshot;
ctx.theme.setTheme('system');
const unsubscribe = ctx.theme.subscribe(() => {
  console.log(ctx.theme.snapshot);
});
```

`preference` 表示用户选择，`resolvedTheme` 表示实际的 `light` 或 `dark`。快照只读且冻结，状态未变化时保持引用和订阅通知不变。React 可使用 `useSyncExternalStore(theme.subscribe, () => theme.snapshot)`，无需另一套 Provider 状态。

订阅者的同步异常通过 `console.error` 报告，不会阻断其他订阅者或回滚已更新的主题。每轮通知使用开始时的订阅列表；通知期间新增或取消的订阅影响后续轮次。回调内再次修改主题会同步启动新一轮通知，回调始终读取最新快照；若回调销毁运行时，则立即停止当前轮剩余通知。

每个文档应只有一个主题管理者。Cordis 卸载插件时移除所有监听、注销服务，并恢复激活前的主题属性和 `color-scheme`；若提前执行了首屏脚本，恢复的是脚本设置后的值。其他模块不应同时写入所配置的主题属性。销毁后的修改和订阅不会再产生副作用，也不会清除用户已保存的偏好。

## 首屏初始化

构建时使用可在 Node 中导入的入口生成同步脚本：

```ts
import { getThemeScript } from '@react-cordis/theme/theme';

const script = getThemeScript({ storageKey: 'my-app:theme' });
```

把返回的代码放入 HTML `<head>` 的普通 `<script>` 标签，在应用模块加载前执行，并提前加载应用自己的主题 CSS。需要 CSP nonce 时，由宿主给标签设置 nonce。生成器转义配置中的 `<`，防止配置值结束 script 标签。

首屏脚本和运行时必须使用同一份配置。Router 示例的 Vite 配置从 `cordis.yml` 读取 theme 条目生成脚本；禁用该条目时不注入主题脚本。脚本与运行时复用主题解析和 DOM 应用逻辑，首屏脚本不安装监听器，也不写入持久化偏好。

## 从旧实现迁移

- 默认存储键不再使用 `@yunzhen/cordis-ui-theme:preference`。需要保留旧偏好时显式配置该键；Router 示例已这样处理。
- 不再同时修改 `data-theme` 和 `.dark`，请按应用 CSS 选择 `attribute`。
- `setFontSize`、快照的 `fontSize` 及字号常量已移除；应用排版由 CSS 决定。
- 删除 `./styles` 入口和自动皮肤注入。原配色、字体栈与页面基础样式保留在 `examples/router/src/styles.css`，由示例 HTML 静态加载。

当前不提供 SSR、嵌套主题作用域、自定义主题名称、强制主题或过渡控制。
