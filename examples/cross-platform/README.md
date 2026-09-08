# Cordis 跨端产品示例

同一个收藏产品运行在 Web、Electron 和 React Native。共享业务插件、收藏仓库、界面组件和插件装配方式；三端适配插件提供统一的 `ctx.storage`，平台入口负责创建 React 根节点。

## 运行

在仓库根目录执行 `pnpm install`，然后选择一个入口：

```sh
pnpm --filter @examples/cross-platform dev        # Web / Vite
pnpm --filter @examples/cross-platform desktop    # 构建并启动 Electron
pnpm --filter @examples/cross-platform ios        # Expo Go / iOS 模拟器
pnpm --filter @examples/cross-platform android    # Expo Go / Android
pnpm --filter @examples/cross-platform native     # Expo 开发服务器，可连接真机
```

移动端需要与 Expo SDK 57 匹配的 Expo Go，模拟器或真机环境由 Expo 管理。Electron 首次安装需要下载平台二进制；若本机 pnpm 禁用了安装脚本，执行 `node examples/cross-platform/node_modules/electron/install.js`。

添加一条收藏，停用收藏功能，再重新启用：列表应恢复。刷新网页或重新启动应用，数据仍应存在。停用按钮销毁 Cordis 插件实例及其界面贡献，不只是把组件隐藏起来。

## 代码复用的边界

| 代码 | 责任 | 复用范围 |
| --- | --- | --- |
| `src/favorites.ts` | 收藏规则、状态、串行写入，以及业务需要的仓库契约 | 三端 |
| `src/favorites-repository.ts` | 收藏文档的序列化、读取校验与句柄释放 | 三端 |
| `src/storage.ts` | 通用文档契约、名称与大小约束、操作顺序和关闭语义 | 三端 |
| `src/product.ts` | 当前产品的插件组合、启停操作、应用实例清理 | 三端 |
| `src/ui.tsx` | Tamagui 界面、主题配置、插槽贡献与 React 订阅 | 三端 |
| `web/storage.ts` | localStorage 存储适配 | Web |
| `electron/storage.ts` / `main.ts` / `preload.ts` / `renderer.ts` | 文件存储适配、受限 IPC 与渲染进程存储插件 | Electron |
| `native/storage.ts` | Expo SQLite 存储适配及连接释放 | React Native |
| `web/mount.tsx` / `native/index.tsx` | React 根节点的创建与释放 | 对应宿主 |

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

`bootProduct()` 中的父插件把仓库、业务与界面组成一个用户可启停的功能。一个同步生成器 effect 收集子插件 disposer，按界面、业务、仓库的顺序串行释放；应用关闭先等待功能释放，再清理根 Context。普通兄弟 effect 的清理是并行的，不能依赖注册顺序排空业务写入。启停串行执行，启动失败会回滚；普通函数、数据校验和 React 组件保持普通代码。

本示例没有另写依赖解析器、远程加载器或插件市场。三个入口用明确的模块导入选择平台提供者，业务代码中没有 `if (platform)` 分支。新增自有功能时可按这个模式增加业务插件、界面贡献和产品装配；等多个功能确实需要统一设置页时，再把当前的收藏开关扩展为产品级目录。

## 存储契约

业务仓库声明 `inject: ['storage']`，通过 `ctx.storage.open('favorites')` 获得一个具名文档。句柄只提供 `read(): Promise<string | null>`、`write(value): Promise<void>` 和 `close(): Promise<void>`。文档内容是字符串；平台适配不导入收藏类型，不解析业务 JSON。一个功能可以持有多个不同名称的文档。

- 缺失文档返回 `null`；空字符串是有效值。名称最长 64 字符，只允许小写字母开头的字母、数字、下划线、连字符，排除 Windows 设备名。文档最多 4 × 1024 × 1024 个 UTF-16 码元。
- 同一存储实例中，一个名称只能有一个活动句柄。读写按调用顺序执行；失败返回给调用者，不阻塞后续操作。关闭立即拒绝新操作，等待已接受的操作完成后释放名称；重复关闭不影响后来打开的句柄。
- 功能只关闭自己的句柄；存储插件卸载时关闭遗留句柄并释放平台连接。正常停用功能与退出应用会先排空业务队列；直接卸载平台提供者可能使尚未提交给存储的业务命令失败。
- 保留已有数据位置：Web 和 Native 使用 `cordis-cross-platform:favorites`，Native 继续使用 `ExpoSQLiteStorage` 数据库；Electron 使用应用数据目录下的 `favorites.json`。无需迁移或清空旧收藏。
- Electron 主进程只允许该渲染进程访问宿主声明的文档，目前为 `favorites`。新增业务文档时，宿主显式扩充允许列表；IPC 不接受文件路径或 SQL。

这是按文档整体替换的存储，不维护另一份 React 状态。当前收藏最多 1000 条；需要大量记录的局部更新、跨文档事务或多端同步时，再引入相应数据访问能力。文件适配使用临时文件替换，保证正常操作不会读到半份文档；没有承诺断电后的 fsync 持久性。

## 生命周期与数据

- 写入成功后才更新内存和界面；失败显示错误并保留上一次成功状态。
- 停用会等待已经接受的写入，拒绝旧服务对象上的新命令，释放界面贡献和订阅；不删除持久数据。
- 每次 `bootProduct()` 创建独立 Context。测试中的两个应用实例有独立仓库；真实三端的数据保存在各自本地，没有云同步。
- Web 示例按单标签页使用，未实现跨标签页并发编辑。Electron 明确只允许一个应用实例和窗口，主进程用串行写入与临时文件替换保存数据。
- Electron 渲染进程没有 Node 权限。预加载只公开受限文档读写接口，主进程校验来源、允许的名称、文本类型和大小；收藏格式由共享仓库与业务插件校验。
- 桌面关闭窗口时，主进程先请求渲染进程清理产品实例；渲染进程排空已接受的写入并确认后，主进程再清理文件仓库并退出。强制结束进程不属于正常关闭保证。
- 插件开关只影响本次运行，重新启动默认启用。开关偏好持久化、账号切换、SSR、独立插件更新与应用安装包不在本验证范围内。

## 对现有包的改动

新增 `@react-cordis/renderer/react` 入口，复用已有 `SlotRegistry`、`SlotOwner` 与 `Slot`，只安装 slots 服务，不导入 react-dom、不创建 DOM 根节点。现有默认入口继续提供 `uiRenderer.mount()` 和原有 DOM 错误占位。

示例的 React 版本跟随 Expo；Vite 的 `dedupe` 与 Metro 的 React 解析规则确保 workspace 组件使用宿主同一份 React，避免仓库其他包的版本造成重复实例。Tamagui 在 Web/Electron 渲染 DOM，在 Native 渲染原生组件；这里只使用运行时样式，没有启用可选的静态样式提取。

Reanimated、Worklets 与 Metro 配置版本也按 Expo SDK 的兼容矩阵固定，避免 pnpm 自动选择的 peer 版本超出当前 Native 运行时范围。

## 验证命令

```sh
pnpm --filter @examples/cross-platform test
pnpm --filter @examples/cross-platform typecheck
pnpm --filter @examples/cross-platform build:desktop
pnpm --filter @examples/cross-platform build:native
```

三种存储适配运行同一组句柄与持久化契约测试：Web 使用 jsdom localStorage，文件适配使用临时目录，Native 仅替换 Expo SQLite 原生驱动。另覆盖 IPC 拒绝越界访问、写入中停用与退出、旧命令拒绝、写入失败、应用隔离、连续启停与依赖服务恢复。Native 驱动替身和 bundle 构建不能代替真机或模拟器交互验证。

2026-09-09 存储适配改造后的验证结果：

| 目标 | 已验证 |
| --- | --- |
| 示例与 renderer | 25 项测试通过；示例类型检查与 ESLint 通过 |
| Web | 原有收藏读取、新增、停用、重新启用与刷新恢复 |
| Electron / macOS arm64 | 原有文件读取；通过通用 IPC 写入新收藏；停用与重新启用；正常关闭进程退出，重启恢复数据 |
| iOS 18 / iPhone 16 Pro 模拟器 / Expo Go | 原有 SQLite 数据读取；新增、停用、重新启用与重载恢复 |
| Android | Metro 与 Hermes 生产 bundle 构建通过；尚未在 Android 设备或模拟器交互验证 |
