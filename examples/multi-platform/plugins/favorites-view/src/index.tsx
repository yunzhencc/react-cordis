import type { Context } from '@deepseek-ai/cordis';
import type { Favorites } from '@examples/multi-platform-favorites';
import type {} from '@examples/multi-platform-product-shell';
import type {} from '@react-cordis/i18n';
import { FavoritesError } from '@examples/multi-platform-favorites';
import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, H2, Input, Paragraph, Text, XStack, YStack } from 'tamagui';
import { favoritesMessages } from './locales';

export const name = 'favorites-view';
export const inject = ['slots', 'favorites', 'i18n'];

export function apply(ctx: Context) {
  const service = ctx.favorites;
  ctx.effect(() => ctx.i18n.register('multiPlatformFavorites', favoritesMessages));
  ctx.slots.inject('favorites.content', () => ctx.slots.register({ name: 'favorites.content' }, () => <FavoritesPage service={service} />));
}

function FavoritesPage({ service }: { service: Favorites }) {
  const { t } = useTranslation('multiPlatformFavorites');
  const items = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<FavoritesError['code'] | 'operationFailed'>();
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    }
    catch (reason) {
      console.error(reason);
      setError(reason instanceof FavoritesError ? reason.code : 'operationFailed');
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
        <H2 size="$6">{t('title')}</H2>
        <Text color="$gray10">{t('count', { count: items.length })}</Text>
      </XStack>
      <YStack gap="$3">
        <Input aria-label={t('titleLabel')} placeholder={t('titlePlaceholder')} value={title} onChangeText={setTitle} maxLength={200} />
        <Input
          aria-label={t('urlLabel')}
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
        <Button theme="blue" disabled={busy || !title.trim() || !url.trim()} onPress={() => { void add(); }}>{t('add')}</Button>
        {error ? <Text color="$red10" role="alert">{t(error)}</Text> : null}
      </YStack>
      {items.length === 0 && <Paragraph color="$gray10">{t('empty')}</Paragraph>}
      {items.map(item => (
        <XStack key={item.url} gap="$3" alignItems="center" padding="$4" borderRadius="$4" backgroundColor="$background" borderWidth={1} borderColor="$gray5">
          <YStack flex={1} gap="$1" minWidth={0}>
            <Text fontWeight="600">{item.title}</Text>
            <Text color="$gray10" numberOfLines={1}>{item.url}</Text>
          </YStack>
          <Button size="$3" disabled={busy} aria-label={t('removeLabel', { title: item.title })} onPress={() => { void run(() => service.remove(item.url)); }}>{t('remove')}</Button>
        </XStack>
      ))}
    </YStack>
  );
}
