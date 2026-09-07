import type { SettingsEntry } from '../../../examples/router/plugins/settings-layout/src/registry';
import type { I18nRuntime, TranslationKey, TranslationNamespace } from '../src';
import { useTranslation } from 'react-i18next';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: {
      greeting: {
        title: 'Welcome';
        message: { welcome: 'Hello' };
        steps: readonly ['First', 'Second'];
      };
      page: { description: 'Description' };
    };
    strictKeyChecks: true;
  }
}

declare const runtime: I18nRuntime;
runtime.register('greeting', { en: { title: 'Welcome', message: { welcome: 'Hello' } } });
runtime.register('greeting', { ja: { message: { welcome: 'こんにちは' } } });
runtime.register('greeting', { ja: {} });
runtime.register('greeting', { ja: { steps: ['最初', '次'] as const } });
runtime.register('page', { zh: { description: '说明' } });

// @ts-expect-error Unknown namespace.
runtime.register('greting', { en: { title: 'Welcome' } });
// @ts-expect-error Unknown dictionary key.
runtime.register('greeting', { ja: { titel: 'ようこそ' } });
// @ts-expect-error Nested dictionary keys are checked.
runtime.register('greeting', { ja: { message: { welcom: 'こんにちは' } } });
// @ts-expect-error Dictionary keys cannot come from another namespace.
runtime.register('greeting', { en: { description: 'Wrong namespace' } });
// @ts-expect-error Text values must remain strings.
runtime.register('greeting', { ja: { title: 42 } });
// @ts-expect-error Nested objects cannot be replaced with text.
runtime.register('greeting', { ja: { message: 'Hello' } });
// @ts-expect-error Empty arrays cannot replace a nested dictionary.
runtime.register('greeting', { ja: { message: [] } });
// @ts-expect-error Functions cannot replace a nested dictionary.
runtime.register('greeting', { ja: { message: () => 'Hello' } });
const invalidSubtree = { ja: { message: [] as const } };
// @ts-expect-error Named readonly arrays cannot replace a nested dictionary either.
runtime.register('greeting', invalidSubtree);

const extraKey = { ja: { title: 'ようこそ', typo: 'Wrong key' } };
// @ts-expect-error Named dictionaries must not bypass key checks.
runtime.register('greeting', extraKey);
const extraNestedKey = { ja: { message: { welcome: 'こんにちは', typo: 'Wrong key' } } };
// @ts-expect-error Named nested dictionaries must not bypass key checks.
runtime.register('greeting', extraNestedKey);
declare const unknownNamespace: string;
// @ts-expect-error There is no implicit string overload in a typed project.
runtime.register(unknownNamespace, { en: { title: 'Welcome' } });
declare const unionNamespace: 'greeting' | 'page';
// @ts-expect-error A union namespace must be narrowed before registering namespace-specific keys.
runtime.register(unionNamespace, { en: { title: 'Welcome' } });

export function useCheckedTranslation() {
  const { t } = useTranslation('greeting');
  t('title');
  t('message.welcome');
  // @ts-expect-error Unknown namespace.
  useTranslation('greting');
  // @ts-expect-error Unknown key.
  t('titel');
  // @ts-expect-error Unknown nested key.
  t('message.welcom');
  // @ts-expect-error Providing a default does not make an unknown key valid.
  t('titel', { defaultValue: 'Fallback' });

  const { t: translateLabel } = useTranslation<['greeting', ...TranslationNamespace[]]>(['greeting']);
  translateLabel('title');
  // @ts-expect-error Unqualified keys must belong to the default namespace.
  translateLabel('description');
  const settings: Pick<SettingsEntry, 'labelKey'> = { labelKey: 'page:description' };
  translateLabel(settings.labelKey!);
  const group: SettingsEntry['group'] = { id: 'test', label: 'Hello', labelKey: 'greeting:message.welcome', order: 0 };
  translateLabel(group.labelKey!);
  // @ts-expect-error Qualified keys must belong to their namespace.
  settings.labelKey = 'greeting:description';
  // @ts-expect-error Settings labels cannot contain unknown keys.
  settings.labelKey = 'page:typo';
  // @ts-expect-error Settings groups cannot contain unknown namespaces.
  group.labelKey = 'unknown:title';
  // @ts-expect-error Shared metadata must specify its namespace.
  const unqualified: TranslationKey = 'title';
  return unqualified;
}
