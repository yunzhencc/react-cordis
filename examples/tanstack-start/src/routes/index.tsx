import { Slot, SlotOwner } from '@react-cordis/renderer/react';
import { createFileRoute } from '@tanstack/react-router';
import { useState, useSyncExternalStore } from 'react';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  const { plugins } = Route.useRouteContext();
  const runtime = plugins.get();
  const controls = runtime.ctx.favoritesControls;
  const enabled = useSyncExternalStore(controls.subscribe, controls.getSnapshot, controls.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      await controls.setEnabled(!enabled);
    }
    catch {
      setError('插件切换失败，请重试。');
    }
    finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="intro">
        <p className="eyebrow">自己的阅读角落</p>
        <h1>留住有用的发现。</h1>
        <p>把文档、工具和灵感放在一起，下次需要时轻松找到。</p>
      </div>
      <div className="toolbar">
        <div className="seed-links">
          <span>打开示例清单</span>
          <a href="/">阅读</a>
          <a href="/?list=tools">工具</a>
        </div>
        <button type="button" className="quiet" disabled={busy} aria-pressed={enabled} onClick={() => { void toggle(); }}>{busy ? '切换中…' : enabled ? '停用收藏插件' : '启用收藏插件'}</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="panel">
        <SlotOwner owner={runtime.owner}><Slot name="root" /></SlotOwner>
        {!enabled && <p className="empty">收藏插件已停用。重新启用后，本次添加的内容仍会保留。</p>}
      </div>
      <p className="note">示例数据保存在本次页面会话中。站内导航保留修改，刷新页面恢复初始清单。</p>
    </>
  );
}
