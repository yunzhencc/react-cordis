import type { Context } from '@deepseek-ai/cordis';
import type { I18nRuntime } from '@react-cordis/i18n';
import { I18nProvider } from '@react-cordis/i18n';
import { Slot } from '@react-cordis/renderer/react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, H1, Paragraph, Text, XStack, YStack } from 'tamagui';
import { shellMessages } from './locales';

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
export const inject = ['slots', 'product', 'i18n'];

export function apply(ctx: Context) {
  const controls = ctx.product;
  const i18n = ctx.i18n;
  ctx.effect(() => i18n.register('multiPlatformShell', shellMessages));
  ctx.slots.register({ name: 'root', children: { 'favorites.content': { kind: 'single', scope: 'root' } } }, () => (
    <I18nProvider i18n={i18n}><Shell controls={controls} i18n={i18n} /></I18nProvider>
  ));
}

function Shell({ controls, i18n }: { controls: ProductControls; i18n: I18nRuntime }) {
  const { t } = useTranslation('multiPlatformShell');
  const languages = useSyncExternalStore(listener => i18n.subscribe(listener), () => i18n.languages);
  const enabled = useSyncExternalStore(controls.subscribe, controls.getSnapshot, controls.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [changingLanguage, setChangingLanguage] = useState(false);
  const [error, setError] = useState<'toggleError' | 'languageError'>();
  useEffect(() => {
    if (typeof document !== 'undefined')
      document.title = t('windowTitle');
  }, [t]);
  const changeLanguage = async (locale: string) => {
    setChangingLanguage(true);
    setError(undefined);
    try {
      await i18n.setLocale(locale);
    }
    catch (reason) {
      console.error(reason);
      setError('languageError');
    }
    finally {
      setChangingLanguage(false);
    }
  };
  const toggle = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await controls.setEnabled(!enabled);
    }
    catch (reason) {
      console.error(reason);
      setError('toggleError');
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <YStack gap="$6">
      <YStack gap="$2">
        <Text color="$blue10" fontWeight="700">{t('brand')}</Text>
        <H1 size="$9">{t('title')}</H1>
        <Paragraph color="$gray10">{t('description')}</Paragraph>
      </YStack>
      <XStack alignItems="center" gap="$3" flexWrap="wrap">
        <Text>{t('language')}</Text>
        {languages.map(language => (
          <Button
            key={language.id}
            size="$3"
            theme={i18n.locale === language.id ? 'blue' : undefined}
            aria-pressed={i18n.locale === language.id}
            accessibilityState={{ selected: i18n.locale === language.id }}
            disabled={changingLanguage}
            onPress={() => { void changeLanguage(language.id); }}
          >
            {language.label}
          </Button>
        ))}
      </XStack>
      <YStack borderWidth={1} borderColor="$gray5" borderRadius="$5" padding="$4" gap="$3" backgroundColor="$background">
        <XStack alignItems="center" justifyContent="space-between" gap="$3" flexWrap="wrap">
          <YStack gap="$1">
            <Text fontWeight="700">{t('feature')}</Text>
            <Text color="$gray10">
              {t(enabled ? 'enabled' : 'disabled')}
              {' '}
              ·
              {' '}
              {t('retained')}
            </Text>
          </YStack>
          <Button disabled={busy} onPress={() => { void toggle(); }}>
            {t(busy ? 'switching' : enabled ? 'disable' : 'enable')}
          </Button>
        </XStack>
        {error ? <Text color="$red10" role="alert">{t(error)}</Text> : null}
      </YStack>
      <Slot name="favorites.content" />
      {!enabled && <Paragraph color="$gray10">{t('paused')}</Paragraph>}
    </YStack>
  );
}
