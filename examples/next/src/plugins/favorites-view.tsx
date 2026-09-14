import type { Context } from '@deepseek-ai/cordis';
import type { Favorite, Favorites } from '@examples/multi-platform-favorites';
import type {} from '@react-cordis/renderer/react';
import { FavoritesError } from '@examples/multi-platform-favorites';
import { useState, useSyncExternalStore } from 'react';

export const inject = ['slots', 'favorites'];

export function apply(ctx: Context) {
  const service = ctx.favorites;
  ctx.slots.register({ name: 'root' }, () => <LiveFavorites service={service} />);
}

function LiveFavorites({ service }: { service: Favorites }) {
  const items = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
  return <FavoritesView items={items} service={service} />;
}

// The same view renders the serializable SSR snapshot and the live plugin state.
export function FavoritesView({ items, service }: { items: readonly Favorite[]; service?: Favorites }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    }
    catch (reason) {
      setError(reason instanceof FavoritesError ? '请检查名称与网址，网址不能重复。' : '操作失败，请重试。');
    }
    finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="收藏列表">
      <div className="section-heading">
        <h2>我的收藏</h2>
        <span>
          {items.length}
          {' '}
          个链接
        </span>
      </div>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!service)
          return;
        void run(async () => {
          await service.add({ title, url });
          setTitle('');
          setUrl('');
        });
      }}
      >
        <label>
          名称
          <input value={title} onChange={event => setTitle(event.target.value)} disabled={!service} maxLength={200} required placeholder="值得再读的内容" />
        </label>
        <label>
          网址
          <input type="url" value={url} onChange={event => setUrl(event.target.value)} disabled={!service} maxLength={2048} required placeholder="https://example.com" />
        </label>
        <button type="submit" disabled={!service || busy}>{busy ? '保存中…' : '添加收藏'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul className="favorites">
        {items.map(item => (
          <li key={item.url}>
            <div>
              <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
              <p>{item.url}</p>
            </div>
            <button
              type="button"
              className="quiet"
              disabled={!service || busy}
              aria-label={`移除 ${item.title}`}
              onClick={() => {
                if (service)
                  void run(() => service.remove(item.url));
              }}
            >
              移除
            </button>
          </li>
        ))}
      </ul>
      {!items.length && <p className="empty">还没有收藏，从一个链接开始。</p>}
    </section>
  );
}
