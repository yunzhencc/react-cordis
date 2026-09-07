export const pageMessages = {
  zh: {
    title: '国际化示例',
    description: '切换语言，观察两个插件的文案同步变化。',
    language: '界面语言',
    persistence: '刷新页面后会保留所选语言。',
    fallback: '日语语言包只翻译了下方标题，正文会回退到英文。',
  },
  en: {
    title: 'Internationalization example',
    description: 'Switch languages to update the text from both plugins.',
    language: 'Interface language',
    persistence: 'Your language selection is kept after a page reload.',
    fallback: 'The Japanese language pack translates the greeting title only; its body falls back to English.',
  },
} as const;
