# Slot 类型契约

用户已批准在现有 API 上增加编译期契约，并开始开发。

新增可声明合并的 `SlotContracts`，基础包仅声明 `root`。业务插件从运行时子插槽声明推导类型并扩展接口；消费者通过类型导入获取契约。契约不挂载插件，也不授予运行时 owner 权限。

`SlotName` 从契约键推导，`SlotMap` 按键关联对应的 `kind/scope`。注册参数按名称组成判别联合：list 必须提供 id、允许 order；single 保留可选 id、禁止 order。所有公开名称参数、子插槽声明及 Router/Settings 转交链使用同一契约，不增加 string 兜底。具名对象和联合类型也纳入类型验证。

保持 single/list、root scope、无 props 组件与现有卸载行为。运行时仍校验是否声明、owner 权限、重复贡献、有限 order 和生命周期。暂不增加 props 注入、store、keyed/chain 或 session scope。

声明合并属于 TypeScript 编译项目；消费方须纳入对应类型入口。不同应用同名契约不兼容时应使用业务命名空间或独立编译项目。

验证包括独立编译期正反例、未扩展契约的 root-only 编译项目、现有运行时测试、全仓类型检查和 lint。
