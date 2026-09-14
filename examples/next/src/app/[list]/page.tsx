import { PluginPanel } from '../../plugin-provider';

export default function ReadingPage() {
  return (
    <>
      <div className="intro">
        <p className="eyebrow">自己的阅读角落</p>
        <h1>留住有用的发现。</h1>
        <p>把文档、工具和灵感放在一起，下次需要时轻松找到。</p>
      </div>
      <PluginPanel />
      <p className="note">当前清单内的站内导航保留修改。切换清单或刷新页面恢复初始内容。</p>
    </>
  );
}
