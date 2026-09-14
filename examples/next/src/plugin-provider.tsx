'use client';

import type { ReactNode } from 'react';
import type { PluginRuntime, PluginSnapshot } from './runtime';
import { Slot, SlotOwner } from '@react-cordis/renderer/react';
import { createContext, use, useEffect, useState, useSyncExternalStore } from 'react';
import * as configuration from './boot.client.generated';
import { FavoritesView } from './plugins/favorites-view';
import { startPlugins, validateSnapshot } from './runtime';

const PluginContext = createContext<{ initial: PluginSnapshot; runtime?: PluginRuntime; error: string } | null>(null);

export function PluginProvider({ initial, children }: { initial: PluginSnapshot; children: ReactNode }) {
  const [snapshot] = useState(() => validateSnapshot(initial));
  const [runtime, setRuntime] = useState<PluginRuntime>();
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    let owned: PluginRuntime | undefined;
    void startPlugins(snapshot, configuration).then((value) => {
      owned = value;
      if (live)
        setRuntime(value);
      else
        void value.dispose().catch(console.error);
    }, () => {
      if (live)
        setError('插件初始化失败，请刷新重试。');
    });
    return () => {
      live = false;
      void owned?.dispose().catch(console.error);
    };
  }, [snapshot]);
  return <PluginContext value={{ initial: snapshot, runtime, error }}>{children}</PluginContext>;
}

export function PluginPanel() {
  const context = use(PluginContext);
  if (!context)
    throw new Error('PluginPanel requires PluginProvider');
  if (context.runtime)
    return <LivePanel runtime={context.runtime} />;
  return (
    <>
      <div className="toolbar">
        <span>我的清单</span>
        <button type="button" className="quiet" aria-pressed={context.initial.enabled} disabled>{context.initial.enabled ? '停用收藏插件' : '启用收藏插件'}</button>
      </div>
      {context.error && <p role="alert">{context.error}</p>}
      <div className="panel">{context.initial.enabled ? <FavoritesView items={context.initial.items} /> : <Disabled />}</div>
    </>
  );
}

function Disabled() {
  return <p className="empty">收藏插件已停用。重新启用后，本次添加的内容仍会保留。</p>;
}

function LivePanel({ runtime }: { runtime: PluginRuntime }) {
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
      <div className="toolbar">
        <span>我的清单</span>
        <button type="button" className="quiet" disabled={busy} aria-pressed={enabled} onClick={() => { void toggle(); }}>{busy ? '切换中…' : enabled ? '停用收藏插件' : '启用收藏插件'}</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="panel">
        <SlotOwner owner={runtime.ctx.slots.createRootOwner()}><Slot name="root" /></SlotOwner>
        {!enabled && <Disabled />}
      </div>
    </>
  );
}
