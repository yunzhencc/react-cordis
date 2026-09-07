# Slot Contracts Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the current task.

**Goal:** 为现有插槽 API 增加名称、种类和注册参数的编译期约束。

**Architecture:** 插槽拥有者扩展 SlotContracts，运行时继续使用现有 SlotCore。Renderer、Router 和示例 Settings 共享子插槽类型，保留运行时验证。

**Tech Stack:** TypeScript、React、Cordis、Vitest；不增加依赖库。

**Spec:** ../specs/2026-09-07-slot-contracts-design.md

## Global Constraints

- 仅 single/list 和 root scope，不增加 props/store 注入。
- 不增加任意 string 的公开兜底重载。
- 所有示例独立类型检查通过；运行时生命周期保持不变。

## Task 1: 类型正反例与核心 API

- [x] 在 `packages/slots/type-tests/` 添加 `.tsx` 类型用例和独立 tsconfig，覆盖 `ctx.slots.register({ name: 'contract.list' }, Null)` 缺少 id、`<Slot name="typo" />`、错误 kind、具名对象和联合类型。
- [x] 执行 `pnpm exec tsc --noEmit -p packages/slots/type-tests/tsconfig.json`，确认新约束尚未实现时失败。
- [x] 在 `packages/slots/src/index.ts` 增加 SlotContracts、SlotName、按名称关联的 SlotMap 和 SlotRegistration；在 renderer 中贯通所有公开名称入口。

## Task 2: 转交链与消费者迁移

- [x] 更新 router 的 RouteDefinition/RouteSnapshot 和 SettingsEntry；具名 children 经 register/createOwner 转交时仍被校验。
- [x] 在 app-layout、dashboard、settings-general 和 i18n page 的运行时声明旁派生契约；消费插件添加所需类型导入及工作区包依赖。
- [x] 为运行时测试声明测试契约；故意绕过类型的非法输入保留明确错误断言，不放宽生产接口。
- [x] 添加 root-only 类型项目并接入根 `typecheck` 命令。

## Task 3: 文档与验证

- [x] 更新 `docs/architecture.md`，说明声明合并、消费者导入、迁移和运行时边界。
- [x] 运行 `pnpm typecheck`、`pnpm test`、`pnpm lint` 和 `git diff --check`；修复本次引入的问题。
- [x] 检查最终 diff，确认没有新增业务依赖或运行时机制。

## 验证结果

- `pnpm typecheck`：所有工作区及独立类型项目通过。
- `pnpm test`：28 个文件、163 个测试通过。
- `pnpm lint`：通过。
- `pnpm -r --if-present run build`：Basic、i18n、Router 三个示例通过。
- `git diff --check`：通过。
- 新增的依赖条目均为已有工作区包的类型入口；离线安装没有下载新依赖。
