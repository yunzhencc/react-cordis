import type { Context } from '@deepseek-ai/cordis';
import type {} from '@examples/agent-settings-layout';
import { Bot } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './index.module.css';

const messages = {
  zh: {
    models: {
      apiKey: 'API 密钥',
      saved: '已保存',
      save: '保存',
      title: '模型提供商',
    },
    settings: { groups: { coding: '编码' } },
  },
  en: {
    models: {
      apiKey: 'API key',
      saved: 'Saved',
      save: 'Save',
      title: 'Model providers',
    },
    settings: { groups: { coding: 'Coding' } },
  },
} as const;

export const inject = ['i18n', 'models', 'settings'];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.i18n.register('settings-models', messages));
  const models = ctx.models;
  ctx.settings.register({
    id: 'models',
    group: { id: 'coding', label: 'Coding', labelKey: 'settings-models:settings.groups.coding', order: 200 },
    label: 'Model providers',
    labelKey: 'settings-models:models.title',
    Icon: Bot,
    order: 0,
    Component: () => <ModelSettings models={models} />,
  });
}

function ModelSettings({ models }: Pick<Context, 'models'>) {
  const { t } = useTranslation('settings-models');
  const [apiKey, setApiKey] = useState(() => models.settings().apiKey ?? '');
  const [saved, setSaved] = useState(false);

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        models.update({ apiKey });
        setSaved(true);
      }}
    >
      <label className={styles.field}>
        <span>{t('models.apiKey')}</span>
        <input
          autoComplete="off"
          type="password"
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.currentTarget.value);
            setSaved(false);
          }}
        />
      </label>
      <div className={styles.actions}>
        <button type="submit">{t('models.save')}</button>
        {saved && <output>{t('models.saved')}</output>}
      </div>
    </form>
  );
}
