# @react-cordis/i18n

为 Cordis 插件化 React 应用提供多语言支持，基于 i18next 和 react-i18next。插件通过 `ctx.i18n` 注册字典、扩展语言和切换偏好，React 组件通过 `useTranslation()` 读取翻译。

本包内置 `zh`、`en` 两种语言定义，初始字典为空。业务文案、共享命名空间和语言设置界面由应用或业务插件提供。

## 使用本包

### 启用插件

在应用的 `cordis.yml` 中启用 i18n 和 renderer；业务插件另行加入清单：

```yaml
- id: i18n
  name: '@react-cordis/i18n'
  config:
    storageKey: 'my-app:locale'
- id: renderer
  name: '@react-cordis/renderer'
```

`storageKey` 是唯一的插件配置项，可省略，默认值为 `react-cordis:locale`。同源的多个应用需要独立保存语言偏好时，应使用不同的 key。

`@react-cordis/renderer` 会在 React 根部挂载 `I18nProvider`。自行挂载 React 树时，需要使用本包导出的 `<I18nProvider i18n={runtime}>` 包裹组件，其中 `runtime` 是 `ctx.i18n` 或独立创建的 `new I18nRuntime()`。

### 注册字典与翻译

每个业务插件选择自己的命名空间，并将注册操作交给 `ctx.effect()`，使字典随插件卸载而释放：

```tsx
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@react-cordis/i18n';
import { useTranslation } from 'react-i18next';

export const inject = ['i18n'];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.i18n.register('greeting', {
    zh: { title: '欢迎', welcome: '你好，{{name}}' },
    en: { title: 'Welcome', welcome: 'Hello, {{name}}' },
  }));
}

export function Greeting() {
  const { t } = useTranslation('greeting');
  return (
    <section>
      <h1>{t('title')}</h1>
      <p>{t('welcome', { name: 'Ada' })}</p>
    </section>
  );
}
```

`Greeting` 由应用挂载，或通过 Slot、Route 注册。插件包还需声明依赖，并在 `package.json` 的 `cordis.inject` 中加入 `@react-cordis/i18n`；代码中的 `inject` 使用服务名，包元数据使用包名，详见[静态启动链](../../docs/architecture.md#静态启动链)。

字典支持嵌套对象、`{{name}}` 插值和 i18next 的复数、格式化能力。跨命名空间引用使用完整 key，例如 `greeting:title`。在非 React 回调中可调用 `ctx.i18n.instance.t('greeting:title')`；已经计算出的字符串不会随语言切换自动改变。

同一个命名空间可以由不同语言包补充不同语言，但同一组「命名空间 + 语言 ID」只能有一个注册者。重复注册会抛错，包括同一次调用中的 `en` 与 `EN`。更新字典时应先调用旧注册返回的释放函数，再重新注册。

### 选择语言

```ts
await ctx.i18n.setLocale('en');
```

`setLocale()` 只接受已注册语言。选择会写入 localStorage，并更新翻译及 `<html lang>`；内置 `zh` 对应文档标签 `zh-CN`，其他语言使用其注册 ID。存储不可用时仍可切换当前运行时的语言，但选择无法持久保存。

启动及语言目录变动时，按以下顺序确定生效语言：

1. 已保存或本次运行中显式选择、且当前已注册的语言。
2. 浏览器 `navigator.languages`，随后是 `navigator.language`；每个标签先完整匹配，再按主语言子标签匹配。
3. `en`。

已保存但尚未注册的语言会保留为偏好，待语言包注册后生效。没有浏览器环境时，不使用 Node 提供的 `navigator` 推断用户语言。

通过 `ctx.i18n.languages` 获取可选语言。React 中可以用 `useSyncExternalStore()` 订阅语言目录，并用 `useTranslation()` 响应翻译变化；完整选择器见 [i18n 示例页面](../../examples/i18n/plugins/page/src/index.tsx)。本包不提供内置设置行。

### 扩展语言包

外部插件分别注册语言定义和业务命名空间字典：

```ts
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@react-cordis/i18n';

export const inject = ['i18n'];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.i18n.addLanguage({
    id: 'ja',
    label: '日本語',
    fallback: 'en',
  }));
  ctx.effect(() => ctx.i18n.register('greeting', {
    ja: { title: 'ようこそ' },
  }));
}
```

语言定义与字典可以按任意顺序注册。`id` 和 `fallback` 必须符合 ASCII BCP 47 风格标签格式，`label` 不得为空白；fallback 目标必须已注册，整条链必须通向 `en`，重复 ID、未知目标及循环会被拒绝。

语言 ID 按大小写不敏感处理，例如 `pt-BR` 与 `PT-br` 指向同一种语言。资源存储使用小写键，`locale`、语言列表和保存的偏好保留语言定义的 ID 写法。

查找文案时，在请求的命名空间内依次尝试当前语言及其 fallback 链，最后回退到 key 本身。例如上述日语字典缺少 `welcome`，便使用 `greeting` 的英文翻译。本包不自动回退到 `common` 或其他命名空间，也不自动推导区域语言的回退关系；需要 `fr-CA → fr → en` 时，应显式注册这条链。

卸载语言定义会移除可选项，并重新解析生效语言，不会清除已保存的偏好。语言目录变化也会刷新 React 翻译：即使当前语言 ID 不变，移除或恢复中间回退语言后，页面仍会沿新的回退链取词。卸载字典会移除该次注册的资源，页面随之使用剩余的回退翻译。两种注册都返回可重复调用的释放函数，需分别交给 `ctx.effect()` 管理。

## API

| API | 用途 |
| --- | --- |
| `new I18nRuntime({ storageKey? })` | 创建独立运行时；Cordis 插件激活时会自动创建 |
| `locale` | 当前生效语言的 ID |
| `languages` | 按注册顺序排列的只读语言目录快照，目录不变时引用稳定 |
| `setLocale(id): Promise<void>` | 选择已注册语言并保存偏好 |
| `addLanguage({ id, label, fallback }): () => void` | 注册语言定义，返回释放函数 |
| `register(namespace, dictionaries): () => void` | 注册按语言 ID 分组的字典，返回释放函数 |
| `subscribe(listener): () => void` | 订阅语言切换流程和语言目录变化，返回取消订阅函数；字典变化不走此订阅 |
| `instance` | 底层 i18next 实例，可用于翻译及格式化；资源注册和语言选择应通过运行时方法维护 |
| `I18nProvider` | 向 React 子树提供指定运行时的 i18next 实例 |
| `LOCALES` | 内置语言 ID `['zh', 'en']`；完整可选语言列表使用 `languages` |

包根入口与 `./client` 导出同一实现。导出类型包括 `I18nConfig`、`Locale`、`LanguageRegistration` 和 `LocaleDefinition`。

## 理解实现

`I18nRuntime` 管理语言目录、偏好和资源注册的所有权；i18next 负责翻译解析，react-i18next 负责 React 订阅更新。

| 变化 | 通知方式 | React 行为 |
| --- | --- | --- |
| 调用 i18next 语言切换流程 | `languageChanged` | `useTranslation()` 更新翻译 |
| 字典注册 | 资源存储 `added` | 已挂载组件读取新翻译 |
| 字典卸载 | 资源存储 `removed` | 已挂载组件重新解析回退翻译 |
| 语言目录注册或卸载 | `runtime.subscribe()`；生效语言不变时发送 `languageCatalogChanged`，否则走语言切换流程 | 选择器更新可选项，`useTranslation()` 重新解析回退翻译 |

字典刷新不发送 `languageChanged`。该事件仍遵循 i18next 的语义，重复选择当前语言也可能触发通知，不应直接当作一次新的用户操作。

`languageCatalogChanged` 是运行时通过 i18next 实例发送的目录更新通知，React 接入已订阅该事件。`runtime.subscribe()` 的同步回调逐个执行，某个回调抛错时会通过 `console.error` 报告并继续通知其余订阅者，不会中断语言注册、卸载或切换。

## 当前限制

- 字典使用 `Record<string, unknown>`，尚未建立 namespace/key 的类型映射，也不强制中英文键齐全。
- 偏好只保存在当前浏览器的 localStorage，没有 Host 持久化或跨标签页同步，也不监听系统语言的实时变化。
- 没有恢复“跟随浏览器”的专用 API；语言回退最终固定到 `en`。
- 语言标签只做格式校验，不验证完整 BCP 47 注册信息；本包同步 `lang`，不自动设置 RTL 的 `dir`。
- React 资源事件订阅没有按命名空间过滤；动态字典变化可能通知其他使用 `useTranslation()` 的组件。

## 示例与源码

在仓库根目录运行独立示例：

```sh
pnpm start:i18n
```

该示例演示中英日切换、命名空间隔离、部分翻译回退及偏好恢复，使用 `examples:i18n:locale` 作为存储 key。

| 文件 | 职责 |
| --- | --- |
| [src/i18n.ts](src/i18n.ts) | 运行时、偏好解析、语言目录、字典注册与回退 |
| [src/index.tsx](src/index.tsx) | Cordis 服务声明、插件入口和 React Provider |
| [src/i18n.test.ts](src/i18n.test.ts) | 偏好、资源所有权及语言 ID 行为测试 |
| [src/i18n.node.test.ts](src/i18n.node.test.ts) | 非浏览器环境下的语言选择测试 |
| [renderer 集成测试](../renderer/src/index.test.tsx) | 语言切换、动态字典加载与卸载后的 React 更新 |
| [i18n 示例](../../examples/i18n/) | 插件配置、业务字典和外部日语包 |
| [语言设置插件](../../examples/router/plugins/settings-language/src/index.tsx) | 独立业务插件提供的语言设置行 |
