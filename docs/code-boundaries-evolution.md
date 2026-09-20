# 代码边界的演进：从目录到领域，再到插件

本文记录 React Cordis 想探索的一个问题：当 React 应用从少量页面成长为多领域、多端、可扩展的系统时，代码应如何组织，才能让一次变更尽量停留在它所属的边界内？

这不是一种必须遵循的成熟度模型。小型应用可以长期使用第一种方式；很多成熟系统也会同时采用三种方式。重点不在目录名称，而在于边界是否与系统实际复杂度匹配。

## 问题：业务变化不应横跨整个源码树

一个小型 React 应用通常会按技术职责划分目录：

```text
src/
├── components/
├── hooks/
├── pages/
├── services/
├── stores/
└── types/
```

这种形式直接、易于起步。但随着业务增长，“修改收藏”“增加画布节点”“调整账户权限”这类变更，往往需要同时穿过多个目录。业务边界只存在于开发者脑中，目录和依赖图没有把它表达出来。

以下三种组织方式，是边界随着复杂度增加逐步变得明确的过程。

## 阶段一：按技术职责组织

`components/`、`stores/`、`services/` 这类总目录按代码的技术角色归类。

它适合功能少、团队小、变化范围清晰的应用。其优点是约定少、查找路径直接；代价是同一业务的 UI、状态、请求与类型会分散在各处。目录本身也无法限制任意模块相互导入。

`infinite-canvas` 的 Web 应用可以作为这种形态的现实例子：顶层同时有 `components`、`stores`、`services`、`hooks`、`pages` 等目录；部分页面内部已经按画布、素材等领域局部聚合。它不是错误的结构，而是在保留技术目录的同时逐步增加领域边界。[项目源码](https://github.com/basketikun/infinite-canvas)

## 阶段二：按功能或领域组织

第二阶段把“用户可感知的能力”或“业务实体”作为源码的首要归属。例如：

```text
src/
├── app/                 # 入口、路由、全局 Provider
├── features/
│   ├── favorites/
│   │   ├── ui/
│   │   ├── model/
│   │   ├── api/
│   │   └── lib/
│   └── settings/
├── entities/
└── shared/
```

[Feature-Sliced Design](https://feature-sliced.design/docs/get-started/overview)（FSD）是这类思路中较完整的一套方法：它区分应用层、业务切片与共享层，并要求依赖按规定方向流动。这里的关键不是必须照搬 FSD 的所有层名，而是让一个业务切片拥有自己需要的 UI、状态、接口与局部工具，并避免切片间任意耦合。

[InvokeAI 的 `features/`](https://github.com/invoke-ai/InvokeAI/tree/main/invokeai/frontend/web/src/features) 展示了这一方向：`auth`、`gallery`、`prompt`、`queue` 等能力以业务名称出现。本文不判断它是否严格符合 FSD；它说明了生产代码可以先采用领域切片，而不必先引入运行时插件系统。

### DDD：用领域模型判断边界为何存在

FSD 帮助组织切片，DDD 的 Bounded Context 则追问切片边界为什么应该存在：当术语、规则、数据模型或负责团队发生变化时，是否仍应假设它们属于同一个模型？

例如“收藏”在个人内容管理和团队协作两个上下文里，可能有不同的权限、状态和语言。共享一个名称不意味着必须共享同一个 model。DDD 要求明确这些上下文的关系；当它们交互时，再定义必要的转换，而不是强迫所有概念塞进统一的全局类型。[Bounded Context](https://www.martinfowler.com/bliki/BoundedContext.html)

这不是要求每个 React 应用引入完整的 DDD 战术模式。对前端代码组织而言，它首先提供一种判断依据：feature 应围绕稳定的业务语言和规则聚合，而不是围绕数据库表、接口名称或某个临时页面划分。

### Clean / Hexagonal：用依赖方向保护边界

领域目录本身无法防止业务规则反向依赖某个 UI、浏览器存储或 HTTP SDK。Clean Architecture 和 Hexagonal Architecture 关注的正是这一点：把技术细节放到适配器一侧，让核心规则经由明确的 port/contract 使用外部能力。[Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture)

在 React 应用里，这不需要变成一套额外的模板目录。feature 或 plugin 中的业务逻辑应依赖自己的服务契约；React 组件和事件处理器从输入端驱动业务逻辑，localStorage、桌面桥接或网络客户端则在输出端实现所需能力。这样，同一领域才可能在 Web、桌面、原生或 SSR 宿主中复用和替换。

### 边界需要可验证

目录约定不能阻止跨 feature 的任意导入。项目已拆为 package 或 workspace library 时，可以用 [Nx 的 project tag 与依赖约束](https://nx.dev/docs/features/enforce-module-boundaries) 检查 TypeScript 导入和包依赖；例如让 `shared` 只依赖 `shared`，让业务包只能依赖自己和允许的共享能力。

Nx 的 tag 面向项目，不会自动为任意 `features/<name>` 文件夹建立边界。应用内部尚未拆包的切片仍需要目录级 import lint；不要为了规则把每个小 feature 过早拆成 package。

## 阶段三：将部分领域提升为插件

领域目录解决的是**静态源码边界**：代码放在哪里、谁可以依赖谁。

当某个领域还需要独立装配、启停、替换实现，或由不同宿主复用时，静态目录无法完整表达它的运行时语义。这时可以把该领域提升为插件：

```text
Core：定义服务契约、扩展点、依赖解析与生命周期
  ↓
Plugin：声明依赖，提供服务，贡献 UI 或路由，并负责清理
  ↓
Host/App：选择和配置插件，拥有业务布局、数据与平台实现
```

插件不是“更大的文件夹”。它是可运行的能力边界：它需要声明依赖，能向宿主提供能力，并在停用时撤销服务、UI 贡献和其他副作用。

这里的插件不等于远程安装的第三方代码、插件市场、微前端独立部署或不可信代码沙箱。React Cordis 当前使用构建期确定的静态插件图；插件共享宿主进程的执行环境。

[Backstage](https://github.com/backstage/backstage/blob/master/docs/overview/architecture-overview.md) 是较重的一端：Core 提供扩展机制，App 负责组装，Plugin 提供开发者门户的具体功能，并覆盖多包、前后端扩展与应用装配。React Cordis 不试图复刻 Backstage 的产品领域，而是探索更轻的 React 应用运行时：插件启动、服务依赖、生命周期、Slots、路由和宿主适配。

## FSD 与插件化不是替代关系

“一切皆插件”不应理解为每个组件、hook、store 都应成为独立插件。更合适的原则是：

> 一切跨能力边界的运行时装配通过插件完成；插件内部仍按功能或领域组织普通代码。

一个应用可以同时使用两层边界：

```text
features/
└── favorites/
    ├── ui/
    ├── model/
    ├── api/
    └── plugin.ts        # 仅在这里暴露 Cordis 的 apply/inject
```

`favorites` 仍然是一个业务领域。只有 `plugin.ts` 需要知道它如何注入服务、声明运行时依赖、向 Slot 或路由贡献内容；其余代码不必为插件系统承担额外复杂度。

## 何时应从 feature 提升为 plugin

以下情况通常值得引入插件边界：

- 能力需要独立启停，且停用时必须可靠清理资源和 UI；
- 同一业务能力需要由 Web、桌面、原生或 SSR 宿主以不同实现装配；
- 能力需要向其他领域提供稳定服务契约，或接受受控的扩展；
- 应用需要按配置组合功能，而不是在业务代码里写平台或功能分支。

以下情况通常不值得：

- 只是一个局部组件、hook 或 store；
- 只在一个业务内部使用，且没有独立生命周期；
- 为未来可能的复用提前拆包，却没有明确消费者或替换需求。

先保持 feature 内聚，直到出现真实的运行时组合需求，再提升为 plugin，能避免插件粒度过细和配置噪声。

## React Cordis 的探索边界

React Cordis 的目标不是规定所有应用必须使用某种目录树，也不是提供固定的后台壳。它关注第三阶段所需的通用机制：

- 构建期确定插件图，并校验包级依赖；
- 运行时管理服务依赖、启停与失败清理；
- 通过 Slot、路由与服务契约让插件贡献 React 能力；
- 由宿主决定业务模型、布局、设计系统和平台实现。

这使得应用可以从普通的领域目录开始，而不必一开始就变成完整插件平台；当领域需要跨宿主组合或可选启停时，再由 Cordis 提供升级路径。

## 仍待探索的问题

- feature 与 plugin 的粒度如何随团队规模和产品边界变化；
- 静态依赖规则如何与运行时插件图协作；
- SSR、多端宿主和平台能力替换时，哪些契约应保持通用；
- 如何提供足够的扩展性，同时不把每个应用推向 Backstage 级别的包与生态复杂度。

这些问题没有放之四海皆准的答案。本文的价值在于提供一套可以讨论、验证和逐步调整的边界语言。
