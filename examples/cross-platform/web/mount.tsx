import type { Plugin } from '@deepseek-ai/cordis';
import { createRoot } from 'react-dom/client';
import { bootProduct } from '../src/product';
import { favoritesView, ProductView, shell } from '../src/ui';
import './style.css';

export async function mount(storage: Plugin, host: string) {
  const container = document.getElementById('root')!;
  try {
    const product = await bootProduct(storage, shell, favoritesView);
    const root = createRoot(container);
    root.render(<ProductView product={product} host={host} />);
    let shutdown: Promise<void> | undefined;
    const dispose = () => {
      shutdown ??= (async () => {
        root.unmount();
        await product.dispose();
      })();
      return shutdown;
    };
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        void dispose();
      });
    }
    return dispose;
  }
  catch (error) {
    container.textContent = `启动失败：${String(error)}`;
    container.setAttribute('role', 'alert');
    return async () => {};
  }
}
