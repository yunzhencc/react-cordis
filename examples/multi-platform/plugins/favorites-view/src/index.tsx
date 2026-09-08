import type { Context } from '@deepseek-ai/cordis';
import type { Favorites } from '@examples/multi-platform-favorites';
import type {} from '@examples/multi-platform-product-shell';
import { useState, useSyncExternalStore } from 'react';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';

export const name = 'favorites-view';
export const inject = ['slots', 'favorites'];

export function apply(ctx: Context) {
  const service = ctx.favorites;
  ctx.slots.inject('favorites.content', () => ctx.slots.register({ name: 'favorites.content' }, () => <FavoritesPage service={service} />));
}

function FavoritesPage({ service }: { service: Favorites }) {
  const items = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
    finally {
      setBusy(false);
    }
  };
  const add = () => run(async () => {
    await service.add({ title, url });
    setTitle('');
    setUrl('');
  });

  return (
    <YStack gap="$4">
      <XStack alignItems="center" justifyContent="space-between">
        <H2 size="$6">我的收藏</H2>
        <Text color="$gray10">
          {items.length}
          {' '}
          条
        </Text>
      </XStack>
      <YStack gap="$3">
        <Input aria-label="收藏标题" placeholder="给收藏起个名字" value={title} onChangeText={setTitle} maxLength={200} />
        <Input
          aria-label="收藏网址"
          placeholder="https://example.com"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          keyboardType="url"
          maxLength={2048}
          onSubmitEditing={() => {
            if (!busy)
              void add();
          }}
        />
        <Button theme="blue" disabled={busy || !title.trim() || !url.trim()} onPress={() => { void add(); }}>添加收藏</Button>
        {error ? <Text color="$red10" role="alert">{error}</Text> : null}
      </YStack>
      {items.length === 0 && <Paragraph color="$gray10">还没有收藏。从一个有用的链接开始。</Paragraph>}
      {items.map(item => (
        <XStack key={item.url} gap="$3" alignItems="center" padding="$4" borderRadius="$4" backgroundColor="$background" borderWidth={1} borderColor="$gray5">
          <YStack flex={1} gap="$1" minWidth={0}>
            <Text fontWeight="600">{item.title}</Text>
            <Text color="$gray10" numberOfLines={1}>{item.url}</Text>
          </YStack>
          <Button size="$3" disabled={busy} aria-label={`移除 ${item.title}`} onPress={() => { void run(() => service.remove(item.url)); }}>移除</Button>
        </XStack>
      ))}
    </YStack>
  );
}
