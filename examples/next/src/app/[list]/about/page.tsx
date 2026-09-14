export default function AboutPage() {
  return (
    <article className="about">
      <p className="eyebrow">关于这个示例</p>
      <h1>一个小小的阅读角落。</h1>
      <p>收藏值得再读的文档与工具。清单保存在当前页面会话中，刷新后恢复初始内容。</p>
      <p>这个页面是 Server Component。收藏区由客户端插件接管交互，返回清单可以继续编辑。</p>
    </article>
  );
}
