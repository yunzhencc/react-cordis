# Cordis 多端产品示例

同一个收藏产品运行在 Web、Electron 和 React Native。三个宿主位于 `apps/web`、`apps/desktop`、`apps/mobile`，共享业务插件、收藏仓库和界面组件；平台适配插件提供统一的 `ctx.storage`。

三端支持中文、英文切换，并在重启后保留所选语言。产品外壳与收藏界面分别持有自己的词典，收藏标题和网址保持用户输入的原文。

## 运行

在仓库根目录执行 `pnpm install`，然后选择一个入口：

```sh
pnpm --filter @examples/multi-platform dev        # Web / Vite
pnpm --filter @examples/multi-platform desktop    # 构建并启动 Electron
pnpm --filter @examples/multi-platform ios        # Expo Go / iOS 模拟器
pnpm --filter @examples/multi-platform android    # Expo Go / Android
pnpm --filter @examples/multi-platform native     # Expo 开发服务器，可连接真机
```

这些命令转发到对应的 workspace 应用，也可以直接运行 `pnpm --filter @examples/multi-platform-web dev`、`pnpm --filter @examples/multi-platform-desktop dev` 或 `pnpm --filter @examples/multi-platform-mobile ios`。

移动端需要与 Expo SDK 57 匹配的 Expo Go，模拟器或真机环境由 Expo 管理。Electron 首次安装需要下载平台二进制；若本机 pnpm 禁用了安装脚本，执行 `node examples/multi-platform/apps/desktop/node_modules/electron/install.js`。

添加一条收藏，停用收藏功能，再重新启用：列表应恢复。刷新网页或重新启动应用，数据仍应存在。停用按钮销毁 Cordis 插件实例及其界面贡献，不只是把组件隐藏起来。

## 目录与依赖

```text
multi-platform/
├── apps/
│   ├── desktop/  # Electron 主进程、预加载、渲染进程及构建配置
│   ├── mobile/   # Expo 入口、应用标识、Metro 和启动图生成
│   └── web/      # 网页入口、HTML 和 Vite
├── plugins/      # 业务、界面和平台适配插件
├── shared/       # 产品启动、共享 React 视图、DOM 挂载
├── tests/        # 跨端契约与产品集成测试
└── package.json  # 聚合命令和集成测试依赖
```

三个应用各自拥有 `package.json`、`tsconfig.json` 和 `cordis.yml`，直接声明自己的插件与宿主依赖。Web 和桌面分别构建，移动端独立使用 Metro；构建产物分别写入 `apps/web/dist`、`apps/desktop/dist/{main,renderer}`、`apps/mobile/dist`。根目录只聚合命令和集成测试，测试需要的各端适配包放在 `devDependencies` 中。

`@examples/multi-platform-shared` 是内部共享包：根入口导出 `bootProduct()` 与产品类型，`/react` 导出 `ProductView`，`/dom` 导出 DOM 挂载。Web 和桌面使用同一个 `/dom` 入口；移动端使用前两个入口并自行创建 Native 根节点。共享包和插件不引用任何 app，app 之间也不互相引用。三端按现有 UI peer 约束统一 React 版本，应用拆分不代表可以任意混用版本。

## 启动配置

三端共享 `plugins/product` 声明的 `dsh.bundle.patch`。这个 bundle 用官方 `cordis:group` 组织 i18n、React 插槽、收藏功能和产品外壳；三个 `apps/*/cordis.yml` 都是空根入口，各端通过 `cordis.patch.yml` 向 `product` 组加入存储提供者。

| 配置 | 职责 |
| --- | --- |
| `plugins/product/cordis.patch.yml` | 共享产品分组、i18n、React 插槽、收藏功能、产品外壳 |
| `apps/web/cordis.patch.yml` | 向产品组加入浏览器存储 |
| `apps/mobile/cordis.patch.yml` | 向产品组加入 Native 存储 |
| `apps/desktop/cordis.patch.yml` | 向产品组加入桌面存储桥接 |
| `apps/desktop/cordis.main.yml` | 主进程文件存储与受限 IPC |

各应用的构建入口显式指定 `bundles: ['@examples/multi-platform-product']` 与 `patches: ['cordis.patch.yml']`。组合顺序为共享 bundle、根配置、应用补丁；复用官方 `applyEntryPatches()`，分组树交给官方 Loader / Group，模块通过 Vite 或 Metro 的静态注册表到达。

要修改默认收藏开关，在应用补丁中增加：

```yaml
- id: favorites
  config:
    enabled: false
```

`config.enabled: false` 保留功能控制服务，用户仍可在界面启用。条目 `disabled: true` 则由 Loader 停用整个插件；当前外壳依赖收藏控制服务，不能单独停用该条目后继续使用原外壳。组的 `disabled` 控制整棵子树，业务排空写入仍由产品关闭流程保证。

Web 与 Electron Renderer 使用 `cordisWebBoot()` 生成虚拟模块和 JSON 启动树；Electron 主进程设置 `target: 'node'`。Native 在启动或构建前从同一配置组合生成含字面量导入的 `src/boot.generated.js`，再由 Metro 打包。修改 Native 配置后重新执行 `generate:native` 并重载；Web 开发服务会监听根配置、补丁与包元数据并整页刷新。

YAML 只保存插件选择和 JSON 配置。Electron 主进程通过 `ctx.provide()` 注入数据目录 `storageDirectory` 和窗口/关闭回调 `desktopHost`，平台插件通过 `inject` 获取它们。YAML 不存储窗口、函数或其他运行时对象。

## 代码复用的边界

| 代码 | 责任 | 复用范围 |
| --- | --- | --- |
| `plugins/favorites` | 收藏规则、状态、串行写入，以及业务需要的仓库契约 | 三端 |
| `plugins/favorites-repository` | 收藏文档的序列化、读取校验与句柄释放 | 三端 |
| `plugins/favorites-feature` | 提供功能开关，组合收藏仓库、业务与界面子插件，按顺序释放 | 三端 |
| `plugins/storage` | 通用文档契约、名称与大小约束、操作顺序和关闭语义 | 三端 |
| `plugins/i18n` | 复用 `I18nRuntime`，从 `ctx.storage` 恢复和保存语言偏好 | 三端 |
| `plugins/product-shell` | 产品外壳、主题配置、根插槽与功能开关 | 三端 |
| `plugins/favorites-view` | 收藏界面、插槽贡献与 React 订阅 | 三端 |
| `shared/src/product.ts` | 激活启动图、等待产品就绪、应用实例清理 | 三端 |
| `shared/src/ui.tsx` | 将产品实例的插槽挂载到共享外壳 | 三端 |
| `plugins/browser-storage` | localStorage 存储适配 | Web |
| `plugins/file-storage` | 主进程文件存储；`./ipc` 子入口提供受限 IPC 插件 | Electron |
| `plugins/desktop-storage` | 通过 preload 暴露的文档接口提供渲染进程存储 | Electron |
| `plugins/native-storage` | Expo SQLite 存储适配及连接释放 | React Native |
| `apps/desktop/src/{main,preload,renderer}.ts` | 窗口、宿主配置、进程桥接与关闭握手 | Electron |
| `shared/src/dom.tsx` / `apps/mobile/src/index.tsx` | React 根节点的创建与释放 | 对应宿主 |

与 Basic、Router 和 i18n 示例一致，运行时插件的每个 `plugins/<名称>` 目录包含 `package.json`、`tsconfig.json` 和 `src/index.ts(x)`，通过包根入口导出插件。包名统一为 `@examples/multi-platform-<名称>`；入口和插件之间使用 workspace 包名引用，不跨包引用 `src` 文件。`plugins/storage` 是适配插件共用的契约与生命周期实现，不额外注册一个空插件。`plugins/product` 是仅包含清单的配置 bundle，不提供空的 `apply()`。

`package.json` 的 `dependencies` 声明代码依赖，`cordis.inject` 记录清单中固定的插件入口依赖；源码 `inject` 声明运行时服务依赖。`storage` 等可替换服务由宿主 YAML 选择提供者，因此不会在消费插件中写死某个平台包。构建工具只导入对应清单的入口，保留 Native 的模块解析与 Electron 的进程边界。

```text
平台存储插件提供 storage
                ↓ inject
收藏功能父插件 ── favorites-repository → favoritesRepository
           ├── favorites 业务插件    → favorites
           └── favorites-view 界面插件
                         ↓ inject / register
                     slots 服务 ← product-shell 声明内容插槽
                         ↓
              React DOM / React Native 渲染根节点
```

Cordis 负责服务注入、依赖失效、插件实例和资源清理。业务插件通过 `ctx.effect()` 注册清理，界面通过 `ctx.slots.register()` 绑定到当前插件实例。移除存储提供者会让共享仓库、业务及其界面失效；恢复提供者后由 Cordis 重建依赖插件。

## 多语言

`plugins/i18n` 等待平台存储后读取独立的 `locale` 文档，创建 `I18nRuntime` 并提供 `ctx.i18n`。关闭内置 localStorage 偏好保存，通过运行时保存回调复用三端文档存储。切换成功后才更新界面；保存失败时显示当前语言的错误提示，保持原语言。首次启动使用浏览器可用的语言提示，Native 缺少该提示时使用英文；无效的已存偏好回退到默认语言。

`product-shell/src/locales.ts` 与 `favorites-view/src/locales.ts` 分别维护 `multiPlatformShell`、`multiPlatformFavorites` 命名空间。插件通过 `ctx.effect()` 注册和释放字典；外壳提供共享 `I18nProvider` 和语言按钮，停用收藏不会卸载语言设置。基础 i18n 包不持有产品词典。英文数量采用 i18next 复数规则，错误提示保留错误码并在渲染时翻译。

Web 和桌面 Vite 对 React、React DOM、react-i18next 去重；Metro 也统一解析宿主的 React 与 react-i18next，确保提供者与各插件的 Hook 使用同一个 React Context。Web 与 Electron 的文档语言和标题随切换更新。

`bootProduct()` 使用官方 Loader 激活 YAML 组合后的插件树；`favorites-feature` 提供 `ctx.product` 控制服务，其内部依赖存储的子插件组合仓库、业务与界面。控制服务独立于存储生命周期，存储失效和恢复不会重置用户的启停意图。一个同步生成器 effect 收集子插件 disposer，按界面、业务、仓库的顺序串行释放；应用关闭先等待功能释放，再清理根 Context。普通兄弟 effect 的清理是并行的，不能依赖注册顺序排空业务写入。启停串行执行，启动失败会回滚；普通函数、数据校验和 React 组件保持普通代码。

本示例没有另写依赖解析器、远程加载器或插件市场。各宿主通过 YAML 选择平台提供者，业务代码中没有 `if (platform)` 分支。新增自有功能时可按这个模式增加业务插件、界面贡献和清单条目；等多个功能确实需要统一设置页时，再把当前的收藏开关扩展为产品级目录。

## 存储契约

业务仓库声明 `inject: ['storage']`，通过 `ctx.storage.open('favorites')` 获得一个具名文档。句柄只提供 `read(): Promise<string | null>`、`write(value): Promise<void>` 和 `close(): Promise<void>`。文档内容是字符串；平台适配不导入收藏类型，不解析业务 JSON。一个功能可以持有多个不同名称的文档。

- 缺失文档返回 `null`；空字符串是有效值。名称最长 64 字符，只允许小写字母开头的字母、数字、下划线、连字符，排除 Windows 设备名。文档最多 4 × 1024 × 1024 个 UTF-16 码元。
- 同一存储实例中，一个名称只能有一个活动句柄。读写按调用顺序执行；失败返回给调用者，不阻塞后续操作。关闭立即拒绝新操作，等待已接受的操作完成后释放名称；重复关闭不影响后来打开的句柄。
- 功能只关闭自己的句柄；存储插件卸载时关闭遗留句柄并释放平台连接。正常停用功能与退出应用会先排空业务队列；直接卸载平台提供者可能使尚未提交给存储的业务命令失败。
- 示例重命名为 `multi-platform` 后，保留已有应用标识和数据位置：Expo slug 为 `cordis-cross-platform`，Android 包名为 `dev.cordis.crossplatform`；Web 和 Native 使用 `cordis-cross-platform:favorites`，Native 继续使用 `ExpoSQLiteStorage` 数据库；Electron 使用应用数据目录 `cordis-cross-platform` 下的 `favorites.json`。无需迁移或清空旧收藏。
- Electron 主进程只允许该渲染进程访问宿主声明的文档，目前为 `favorites` 和 `locale`。新增业务文档时，宿主显式扩充允许列表；IPC 不接受文件路径或 SQL。

这是按文档整体替换的存储，不维护另一份 React 状态。当前收藏最多 1000 条；需要大量记录的局部更新、跨文档事务或多端同步时，再引入相应数据访问能力。文件适配使用临时文件替换，保证正常操作不会读到半份文档；没有承诺断电后的 fsync 持久性。

## 生命周期与数据

- 写入成功后才更新内存和界面；失败显示错误并保留上一次成功状态。
- 停用会等待已经接受的写入，拒绝旧服务对象上的新命令，释放界面贡献和订阅；不删除持久数据。
- 每次 `bootProduct()` 创建独立 Context。测试中的两个应用实例有独立仓库；真实三端的数据保存在各自本地，没有云同步。
- Web 示例按单标签页使用，未实现跨标签页并发编辑。Electron 明确只允许一个应用实例和窗口，主进程用串行写入与临时文件替换保存数据。
- Electron 渲染进程没有 Node 权限。预加载只公开受限文档读写接口，主进程校验来源、允许的名称、文本类型和大小；收藏格式由共享仓库与业务插件校验。
- 桌面关闭窗口时，主进程先请求渲染进程清理产品实例；渲染进程排空已接受的写入并确认后，主进程再清理文件仓库并退出。强制结束进程不属于正常关闭保证。
- 插件开关只影响本次运行，重新启动采用 YAML 中的 `config.enabled`。开关偏好持久化、账号切换、SSR、独立插件更新与应用安装包不在本验证范围内。

## 对现有包的改动

新增 `@react-cordis/renderer/react` 入口，复用已有 `SlotRegistry`、`SlotOwner` 与 `Slot`，只安装 slots 服务，不导入 react-dom、不创建 DOM 根节点。现有默认入口继续提供 `uiRenderer.mount()` 和原有 DOM 错误占位。

`@react-cordis/boot-config` 支持包显式导出的子入口，如 `@react-cordis/renderer/react` 和文件存储的 `/ipc`，从所属包读取元数据。`@react-cordis/vite` 新增可选 `manifestFileName`，让同一构建中的多个启动图分别输出文件，默认文件名保持不变。

示例的 React 版本跟随 Expo；UI 和 Native 适配包通过 peer 依赖约束宿主的 React、React DOM、React Native 或 Expo 版本。Vite 的 `dedupe` 与 Metro 的 React 解析规则确保 workspace 组件使用宿主同一份 React，避免仓库其他包的版本造成重复实例。Tamagui 在 Web/Electron 渲染 DOM，在 Native 渲染原生组件；这里只使用运行时样式，没有启用可选的静态样式提取。

Reanimated、Worklets 与 Metro 配置版本也按 Expo SDK 的兼容矩阵固定，避免 pnpm 自动选择的 peer 版本超出当前 Native 运行时范围。

## 验证命令

```sh
pnpm --filter @examples/multi-platform test
pnpm --filter @examples/multi-platform typecheck
pnpm --filter @examples/multi-platform build:web
pnpm --filter @examples/multi-platform build:desktop
pnpm --filter @examples/multi-platform build:native
```

`pnpm --filter @examples/multi-platform build` 顺序执行三端构建；`typecheck` 覆盖测试、三个宿主、共享包和所有插件包。

各存储适配运行同一组句柄与持久化契约测试：Web 使用 jsdom localStorage，文件适配使用临时目录，Native 仅替换 Expo SQLite 原生驱动，桌面渲染端替换 preload 文档接口。另覆盖 IPC 来源校验与卸载清理、拒绝越界访问、写入中停用与退出、旧命令拒绝、写入失败、应用隔离、连续启停与依赖服务恢复。驱动替身和 bundle 构建不能代替真机或模拟器交互验证。

2026-09-09 接入官方 Loader / Group、共享 bundle、各端补丁和多语言后的验证结果：

| 目标 | 已验证 |
| --- | --- |
| 自动检查 | 全仓 255 项测试通过；全仓类型检查、相关文件 ESLint 和 diff 检查通过 |
| Web | 从 Vite 启动；实际切换中英文、停用后切换语言并重新启用；刷新恢复英文，并校验 localStorage 中的 `locale` 文档 |
| Electron / macOS arm64 | 中英切换、复数数量、错误提示随语言变化；停用后重新启用，词典正常恢复；完整退出重启保留英文，原有两条收藏不变 |
| iOS 18 / iPhone 16 Pro 模拟器 / Expo Go | Hermes 正常显示英文并切换为中文；重启后从 SQLite 恢复中文，保留原有两条收藏 |
| Android | Metro 与 Hermes 生产 bundle 构建通过；尚未在 Android 设备或模拟器交互验证 |

Web/Electron、iOS/Android 生产构建通过，各端产物独立输出。新增官方 Loader、Group 和 Include 依赖，复用其生命周期和补丁操作。测试覆盖配置组合、组隔离与子树启停、静态导入、禁用条目、JSON 表达式拒绝、启动失败回滚，以及存储恢复和写入排空。

多语言测试额外覆盖宿主异步保存、失败时保留原语言、关闭时等待已接受的语言写入，以及 Native 缺少浏览器语言提示的初始化。更新依赖或调整 Metro 模块解析配置后，需要重启开发服务并清缓存。

客户端适配移除官方 Loader 顶层的表达式求值器，避免 Hermes 的 `with` 限制和 Electron CSP 的动态求值限制；配置继续只接受 JSON。Vite 的开发依赖优化与生产构建使用同一转换，Metro 保留 Expo 默认初始化和缓存接口。升级 Loader 或调整该适配后，Vite 使用 `--force`、Expo 使用 `--clear` 重新启动。
