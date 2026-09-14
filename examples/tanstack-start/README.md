# TanStack Start + Cordis SSR

收藏插件在服务端输出首屏 HTML，浏览器使用同一份快照恢复插件后接管交互。支持添加、移除收藏、站内导航和插件停用 / 启用。

## 运行

在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm start:tanstack
```

默认地址为 `http://localhost:3001`。生产构建使用 Nitro 的 Node 服务：

```bash
pnpm --filter @examples/tanstack-start build
PORT=3001 pnpm --filter @examples/tanstack-start start
```

`/` 使用阅读清单，`/?list=tools` 使用工具清单，`/?disabled=1` 演示插件初始停用。打开 `/about` 后返回首页，浏览器端的收藏修改仍然保留。

数据保存在每个运行时独立的内存仓库里；完整刷新恢复初始清单。这里没有账号、数据库或跨请求持久化，URL 参数仅选择公开的示例数据。

## 运行边界

1. `getRouter()` 为每个服务端请求创建独立的插件宿主，浏览器为自己的 Router 保留一份宿主。
2. 根路由 `beforeLoad` 在服务端读取请求参数，等待 Cordis 插件就绪。`readRequestSnapshot` 使用 Start 的服务端执行边界。
3. `cordis.yml` 使用官方 Loader / Group 装配 `renderer/react`、共享收藏业务、共享启停控制和本示例视图。宿主提供每次运行独立的 `favoritesRepository`。
4. React 通过 `SlotOwner` / `Slot` 输出收藏 HTML。Start 的 `dehydrate` 仅传递收藏数据和启用状态；`hydrate` 等待客户端插件重建，之后才接管页面。`Context`、组件函数和订阅不进入快照。
5. Start 的 `serverSsrLifecycle.onServerSsrAttach` / `onCleanup` 在响应完成、错误或中断时触发清理。宿主等待尚未完成的启动，再停用业务分组并销毁整个 Context；异步清理失败会记录到服务端日志。客户端 HMR 时也释放旧宿主。

`@react-cordis/vite` 的 `target: 'auto'` 按 Vite 环境的 `consumer` 区分浏览器与服务端：浏览器需要的 Node stub、表达式禁用和预构建适配只在客户端生效。默认 `browser` 与现有 `node` 行为保留。

路由、文档、SSR、流式响应和 hydration 由 TanStack Start 负责；本示例不使用 `bootWebApp()` 或 React Router 插件。浏览器专用主题插件也没有加入 SSR 配置。

## 验证

在仓库根目录执行：

```bash
pnpm exec vitest run examples/tanstack-start/tests packages/vite/src/index.test.ts
pnpm --filter @examples/tanstack-start exec tsc --noEmit
pnpm --filter @examples/tanstack-start build
```

自动检查覆盖并发宿主隔离、服务端 HTML 与客户端快照重建的一致性、启停后数据保留、失效服务拒绝写入、初始停用、无效快照和启动期间关闭，以及真实 Start SSR 响应完成 / 请求中断后的清理和 Vite 双环境模块解析。

浏览器验证：添加收藏 → 切换到关于页并返回 → 停用 / 启用插件 → 移除收藏；检查控制台无 hydration 错误。也应分别直接打开阅读、工具和初始停用的 URL，确认首屏与交互正常。

`src/routeTree.gen.ts` 由 Start 生成并纳入示例，开发和构建时自动更新。构建可能提示收藏业务同时被静态和动态导入：校验器与错误类型复用该模块，因此它不会单独拆包；这不影响 Loader 对插件实例的启停。
