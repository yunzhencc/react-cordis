/* eslint-disable react-refresh/only-export-components -- Cordis plugins export lifecycle functions and register React components. */
import type { Context } from '@deepseek-ai/cordis';
import type { ReactNode } from 'react';
import type { Favorites } from './favorites';
import type { Product, ProductControls } from './product';
import { Slot, SlotOwner } from '@react-cordis/renderer/react';
import { defaultConfig } from '@tamagui/config/v5';
import { useState, useSyncExternalStore } from 'react';
import { Button, createTamagui, H1, H2, Input, isWeb, Paragraph, ScrollView, TamaguiProvider, Text, XStack, YStack } from 'tamagui';

const family = isWeb ? 'system-ui, sans-serif' : 'System';
const config = createTamagui({
  ...defaultConfig,
  settings: { ...defaultConfig.settings, onlyAllowShorthands: false },
  fonts: {
    ...defaultConfig.fonts,
    body: { ...defaultConfig.fonts.body, family },
    heading: { ...defaultConfig.fonts.heading, family },
  },
});

type UIConfig = typeof config;
declare module 'tamagui' {
  interface TamaguiCustomConfig extends UIConfig {}
}
declare module '@react-cordis/slots' {
  interface SlotContracts {
    'favorites.content': { kind: 'single'; scope: 'root' };
  }
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
        <Text color="$blue10" fontWeight="700">CORDIS / 跨端收藏</Text>
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

export const shell = {
  name: 'product-shell',
  inject: ['slots', 'product'],
  apply(ctx: Context) {
    const controls = ctx.product;
    ctx.slots.register({ name: 'root', children: { 'favorites.content': { kind: 'single', scope: 'root' } } }, () => <Shell controls={controls} />);
  },
};

export const favoritesView = {
  name: 'favorites-view',
  inject: ['slots', 'favorites'],
  apply(ctx: Context) {
    const service = ctx.favorites;
    ctx.slots.inject('favorites.content', () => ctx.slots.register({ name: 'favorites.content' }, () => <FavoritesPage service={service} />));
  },
};

export function Frame({ children, host }: { children: ReactNode; host: string }) {
  return (
    <TamaguiProvider config={config} defaultTheme="light">
      <ScrollView flex={1} backgroundColor="$gray2" contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <YStack width="100%" maxWidth={760} alignSelf="center" padding="$5" paddingTop="$9" gap="$7">
          {children}
          <Text color="$gray9" fontSize="$2">{host}</Text>
        </YStack>
      </ScrollView>
    </TamaguiProvider>
  );
}

export function ProductView({ product, host }: { product: Product; host: string }) {
  return <Frame host={host}><SlotOwner owner={product.owner}><Slot name="root" /></SlotOwner></Frame>;
}
