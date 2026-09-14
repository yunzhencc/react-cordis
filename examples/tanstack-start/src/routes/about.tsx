import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/about')({ component: About });

function About() {
  return (
    <article className="about">
      <p className="eyebrow">关于示例</p>
      <h1>同一份插件，完成首屏与交互。</h1>
      <p>服务端为每个请求创建独立的 Cordis 运行时，收藏插件通过插槽输出首屏 HTML。浏览器收到同一份数据后恢复插件状态，并接管交互。</p>
      <p>TanStack Start 管理路由、SSR 和 hydration；Cordis 管理收藏服务、插件启停和插槽。切换页面不会重新创建浏览器端的业务服务。</p>
      <p>这里没有账号系统或持久化数据库。每次完整刷新都会从示例清单开始。</p>
      <Link to="/">返回我的收藏 →</Link>
    </article>
  );
}
