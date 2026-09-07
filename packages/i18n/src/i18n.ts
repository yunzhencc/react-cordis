import i18next from 'i18next';

export const LOCALES = ['zh', 'en'] as const;
export type BuiltInLocale = typeof LOCALES[number];
export type Locale = string;

const DEFAULT_STORAGE_KEY = 'react-cordis:locale';
const LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;

export interface I18nConfig {
  storageKey?: string;
}

export interface LanguageRegistration {
  id: Locale;
  label: string;
  fallback: Locale;
}

export interface LocaleDefinition {
  readonly id: Locale;
  readonly label: string;
  readonly fallback?: Locale;
}

type LocaleResources = Record<string, unknown>;

const BUILT_IN_LOCALES: readonly LocaleDefinition[] = [
  { id: 'zh', label: '中文', fallback: 'en' },
  { id: 'en', label: 'English' },
];

const COMMON_RESOURCES = {
  zh: { common: { close: '关闭', settings: { groups: { personal: '个人' } } } },
  en: { common: { close: 'Close', settings: { groups: { personal: 'Personal' } } } },
};

export class I18nRuntime {
  readonly instance = i18next.createInstance();

  private readonly catalog = new Map<string, LocaleDefinition>();
  private readonly resources = new Map<string, Map<string, LocaleResources>>();
  private preference: Locale | undefined;
  private readonly storageKey: string;
  private readonly listeners = new Set<() => void>();
  private languageSnapshot: readonly LocaleDefinition[] = Object.freeze([]);

  constructor(config: I18nConfig = {}) {
    if (!config || typeof config !== 'object' || Array.isArray(config))
      throw new TypeError('i18n config must be an object');
    const { storageKey = DEFAULT_STORAGE_KEY } = config;
    if (typeof storageKey !== 'string' || !storageKey.trim())
      throw new TypeError('i18n storageKey must be a non-empty string');
    this.storageKey = storageKey;
    this.preference = readLocale(storageKey);

    for (const locale of BUILT_IN_LOCALES)
      this.catalog.set(localeKey(locale.id), locale);
    this.publishLanguages();

    void this.instance.init({
      fallbackLng: locale => this.fallbackChain(locale),
      fallbackNS: 'common',
      initImmediate: false,
      interpolation: { escapeValue: false },
      lng: this.resolveActive(),
      load: 'currentOnly',
      resources: COMMON_RESOURCES,
    });
    this.instance.on('languageChanged', () => {
      this.syncDocumentLanguage();
      this.emitChange();
    });
    this.syncDocumentLanguage();
  }

  get locale(): Locale {
    return this.instance.language || 'en';
  }

  get languages(): readonly LocaleDefinition[] {
    return this.languageSnapshot;
  }

  async setLocale(locale: Locale): Promise<void> {
    const language = this.catalog.get(localeKey(locale));
    if (!language)
      throw new Error(`locale "${locale}" is not registered`);

    this.preference = language.id;
    try {
      localStorage.setItem(this.storageKey, language.id);
    }
    catch {}
    await this.instance.changeLanguage(language.id);
  }

  addLanguage(input: LanguageRegistration): () => void {
    const language = normalizeLanguage(input);
    const key = localeKey(language.id);
    if (this.catalog.has(key))
      throw new Error(`locale "${language.id}" is already registered`);
    if (!this.catalog.has(localeKey(language.fallback!)))
      throw new Error(`locale fallback "${language.fallback}" is not registered`);

    this.catalog.set(key, language);
    try {
      this.assertFallbackChain(language.id);
    }
    catch (error) {
      this.catalog.delete(key);
      throw error;
    }
    this.publishLanguages();
    this.refreshActiveLocale();
    return () => {
      if (this.catalog.get(key) !== language)
        return;
      this.catalog.delete(key);
      this.publishLanguages();
      this.refreshActiveLocale();
    };
  }

  register(namespace: string, dictionaries: Record<string, LocaleResources>): () => void {
    if (!namespace)
      throw new Error('locale namespace must not be empty');

    const entries = Object.entries(dictionaries);
    for (const [locale] of entries) {
      if (!LOCALE_ID_PATTERN.test(locale))
        throw new Error(`locale id "${locale}" is not a BCP 47-style tag`);
    }

    let namespaceResources = this.resources.get(namespace);
    if (!namespaceResources) {
      namespaceResources = new Map();
      this.resources.set(namespace, namespaceResources);
    }
    for (const [locale] of entries) {
      if (namespaceResources.has(localeKey(locale)))
        throw new Error(`locale namespace "${namespace}" already has locale "${locale}"`);
    }
    for (const [locale, resources] of entries) {
      namespaceResources.set(localeKey(locale), resources);
      this.instance.addResourceBundle(locale, namespace, resources);
    }
    this.instance.emit('languageChanged', this.locale);

    return () => {
      let removed = false;
      for (const [locale, resources] of entries) {
        const key = localeKey(locale);
        if (namespaceResources!.get(key) !== resources)
          continue;
        namespaceResources!.delete(key);
        this.instance.removeResourceBundle(locale, namespace);
        removed = true;
      }
      if (removed)
        this.instance.emit('languageChanged', this.locale);
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private refreshActiveLocale(): void {
    const active = this.resolveActive();
    if (this.locale === active)
      this.emitChange();
    else
      void this.instance.changeLanguage(active);
  }

  private publishLanguages(): void {
    this.languageSnapshot = Object.freeze([...this.catalog.values()]);
  }

  private resolveActive(): Locale {
    const preferred = this.preference ? this.catalog.get(localeKey(this.preference)) : undefined;
    return preferred?.id ?? detectLocale(this.languages) ?? 'en';
  }

  private assertFallbackChain(start: Locale): void {
    const seen = new Set<string>();
    let current = this.catalog.get(localeKey(start));
    while (current) {
      const key = localeKey(current.id);
      if (seen.has(key))
        throw new Error(`locale fallback cycle includes "${current.id}"`);
      seen.add(key);
      if (key === 'en')
        return;
      if (!current.fallback)
        throw new Error(`locale "${current.id}" fallback chain does not reach "en"`);
      current = this.catalog.get(localeKey(current.fallback));
      if (!current)
        throw new Error('locale fallback is not registered');
    }
  }

  private fallbackChain(start: string | undefined): Locale[] {
    const chain: Locale[] = [];
    const seen = new Set<string>();
    let current = start && this.catalog.get(localeKey(start));
    while (current && !seen.has(localeKey(current.id))) {
      seen.add(localeKey(current.id));
      chain.push(current.id);
      current = current.fallback ? this.catalog.get(localeKey(current.fallback)) : undefined;
    }
    if (!seen.has('en'))
      chain.push('en');
    return chain;
  }

  private syncDocumentLanguage(): void {
    if (typeof document !== 'undefined')
      document.documentElement.lang = this.locale === 'zh' ? 'zh-CN' : this.locale;
  }

  private emitChange(): void {
    for (const listener of this.listeners)
      listener();
  }
}

function normalizeLanguage(input: LanguageRegistration): LocaleDefinition {
  if (!LOCALE_ID_PATTERN.test(input.id))
    throw new Error(`locale id "${input.id}" is not a BCP 47-style tag`);
  if (!LOCALE_ID_PATTERN.test(input.fallback))
    throw new Error(`locale fallback "${input.fallback}" is not a BCP 47-style tag`);
  if (!input.label.trim())
    throw new Error('locale label must not be empty');
  return Object.freeze({ ...input });
}

function detectLocale(locales: readonly LocaleDefinition[]): Locale | undefined {
  if (typeof window === 'undefined')
    return undefined;
  for (const requested of [...(navigator.languages ?? []), navigator.language]) {
    const exact = locales.find(locale => localeKey(locale.id) === localeKey(requested));
    if (exact)
      return exact.id;
    const primary = localeKey(requested).split('-')[0];
    const matchingLanguage = locales.find(locale => localeKey(locale.id).split('-')[0] === primary);
    if (matchingLanguage)
      return matchingLanguage.id;
  }
  return undefined;
}

function readLocale(storageKey: string): Locale | undefined {
  try {
    return localStorage.getItem(storageKey) ?? undefined;
  }
  catch {
    return undefined;
  }
}

function localeKey(locale: string): string {
  return locale.toLowerCase();
}
