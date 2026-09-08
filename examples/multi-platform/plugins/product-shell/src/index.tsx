import type { Context } from '@deepseek-ai/cordis';
import { Slot } from '@react-cordis/renderer/react';
import { useState, useSyncExternalStore } from 'react';
import { Button, H1, Paragraph, Text, XStack, YStack } from 'tamagui';

export { Frame } from './frame';

export interface ProductControls {
  ready: () => Promise<void>;
  dispose: () => Promise<void>;
  getSnapshot: () => boolean;
  subscribe: (listener: () => void) => () => void;
  setEnabled: (enabled: boolean) => Promise<void>;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    product: ProductControls;
  }
}

declare module '@react-cordis/slots' {
  interface SlotContracts {
    'favorites.content': { kind: 'single'; scope: 'root' };
  }
}

export const name = 'product-shell';
export const inject = ['slots', 'product'];

export function apply(ctx: Context) {
  const controls = ctx.product;
  ctx.slots.register({ name: 'root', children: { 'favorites.content': { kind: 'single', scope: 'root' } } }, () => <Shell controls={controls} />);
}

function Shell({ controls }: { controls: ProductControls }) {
  const enabled = useSyncExternalStore(controls.subscribe, controls.getSnapshot, controls.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      await controls.setEnabled(!enabled);
    }
    catch (reason) {
      setError(String(reason));
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <YStack gap="$6">
      <YStack gap="$2">
        <Text color="$blue10" fontWeight="700">CORDIS / 多端收藏</Text>
        <H1 size="$9">值得留下的好东西。</H1>
        <Paragraph color="$gray10">收藏文章、工具和灵感，在熟悉的界面里继续工作。</Paragraph>
      </YStack>
      <YStack borderWidth={1} borderColor="$gray5" borderRadius="$5" padding="$4" gap="$3" backgroundColor="$background">
        <XStack alignItems="center" justifyContent="space-between" gap="$3" flexWrap="wrap">
          <YStack gap="$1">
            <Text fontWeight="700">收藏功能</Text>
            <Text color="$gray10">
              {enabled ? '已启用' : '已停用'}
              {' '}
              · 停用后保留收藏数据
            </Text>
          </YStack>
          <Button disabled={busy} onPress={() => { void toggle(); }}>
            {busy ? '正在切换…' : enabled ? '停用收藏' : '启用收藏'}
          </Button>
        </XStack>
        {error ? <Text color="$red10" role="alert">{error}</Text> : null}
      </YStack>
      <Slot name="favorites.content" />
      {!enabled && <Paragraph color="$gray10">收藏功能已暂停。重新启用后，可以继续查看和管理已有收藏。</Paragraph>}
    </YStack>
  );
}
