# Next.js + Cordis

App Router 示例。服务端运行收藏业务插件，输出数据快照；Client Component 使用快照生成首屏 HTML，挂载后启动完整插件图并通过 Slot 接管添加、移除及启停交互。

## 运行

在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm start:next
```

默认地址为 `http://localhost:3002`，首页跳转到 `/reading`。`/tools` 提供另一份清单，`/disabled` 演示初始停用。每份清单都有 `/about` 页面，站内往返保留客户端修改；切换清单或完整刷新恢复初始数据。

```bash
pnpm --filter @examples/next build
pnpm --filter @examples/next start
```

使用 Next.js 16.3.5、Node.js 和 Turbopack；没有账号、数据库或跨请求持久化。

## 运行边界

- `cordis.server.yml` 只装配共享收藏业务和启停控制。每次执行服务端取数时创建独立 Context，取得快照后在 `finally` 中释放插件。插件资源不跨越 React 渲染过程。
- `cordis.client.yml` 额外装配 React renderer 与本示例视图。`PluginProvider` 位于清单的 layout 中，拥有浏览器插件生命周期；支持 Strict Mode 重挂载和异步启动期间卸载。
- 服务端只向 Provider 传递可序列化数据。首屏和 hydration 的首次渲染使用相同快照，按钮在插件就绪后启用；完整运行时通过 Slot 渲染交互视图。
- 当前实现是业务插件参与服务端取数、插件视图参与 HTML 预渲染。服务端不会执行客户端 Slot 注册表，也不会将 Cordis 实例或组件函数传过 RSC 边界。
- Next.js 拥有路由、Server Components 和 hydration；示例不调用 `bootWebApp()`，不使用 React Router 插件。

`pnpm generate` 复用现有 YAML 解析和模块注册表生成器。生成文件纳入示例；修改 YAML 后重新运行命令或重启开发服务。Turbopack 的浏览器规则复用官方 Loader 的表达式禁用适配，仅在浏览器端替换 Node 环境访问，服务端保留原始实现。

## 验证

```bash
pnpm exec vitest run examples/next/tests
pnpm --filter @examples/next exec tsc --noEmit
pnpm --filter @examples/next build
```

浏览器检查：添加收藏 → 进入关于页并返回 → 停用 / 启用 → 移除；另直接打开三份清单，确认首屏内容正确且没有 hydration 错误。禁用 JavaScript 时仍能阅读初始清单。
