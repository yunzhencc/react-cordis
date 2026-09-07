export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export interface ThemeConfig {
  storageKey?: string;
  defaultTheme?: ThemePreference;
  attribute?: 'class' | `data-${string}`;
  enableColorScheme?: boolean;
}

export interface ThemeSnapshot {
  readonly preference: ThemePreference;
  readonly resolvedTheme: ResolvedTheme;
}

export class ThemeRuntime {
  private readonly config: Required<ThemeConfig>;
  private readonly listeners = new Set<() => void>();
  private readonly mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly restoreDOM: () => void;
  private disposed = false;
  private state: ThemeSnapshot;

  constructor(config: ThemeConfig = {}) {
    this.config = resolveConfig(config);
    const root = document.documentElement;
    const { attribute, enableColorScheme } = this.config;
    const previousAttribute = root.getAttribute(attribute);
    const previousClasses = ['light', 'dark'].filter(name => root.classList.contains(name));
    const colorScheme = root.style.getPropertyValue('color-scheme');
    const priority = root.style.getPropertyPriority('color-scheme');
    this.restoreDOM = () => {
      if (attribute === 'class') {
        root.classList.remove('light', 'dark');
        root.classList.add(...previousClasses);
      }
      else if (previousAttribute === null) {
        root.removeAttribute(attribute);
      }
      else {
        root.setAttribute(attribute, previousAttribute);
      }
      if (enableColorScheme) {
        if (colorScheme)
          root.style.setProperty('color-scheme', colorScheme, priority);
        else
          root.style.removeProperty('color-scheme');
      }
    };
    this.state = applyTheme(this.config);
    this.mediaQuery.addEventListener('change', this.onMediaChange);
    window.addEventListener('storage', this.onStorage);
  }

  get snapshot(): ThemeSnapshot {
    return this.state;
  }

  subscribe = (listener: () => void) => {
    if (!this.disposed)
      this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setTheme(preference: ThemePreference) {
    if (this.disposed)
      return;
    if (!['light', 'dark', 'system'].includes(preference))
      throw new TypeError('theme preference must be light, dark or system');
    try {
      localStorage.setItem(this.config.storageKey, preference);
    }
    catch {}
    this.update(preference);
  }

  dispose() {
    if (this.disposed)
      return;
    this.disposed = true;
    this.mediaQuery.removeEventListener('change', this.onMediaChange);
    window.removeEventListener('storage', this.onStorage);
    this.listeners.clear();
    this.restoreDOM();
  }

  private readonly onMediaChange = () => {
    if (this.state.preference === 'system')
      this.update('system');
  };

  private readonly onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== this.config.storageKey)
      return;
    try {
      if (event.storageArea !== localStorage)
        return;
    }
    catch {
      return;
    }
    this.update(event.newValue);
  };

  private update(preference: string | null) {
    if (this.disposed)
      return;
    const next = applyTheme(this.config, preference);
    if (next.preference === this.state.preference && next.resolvedTheme === this.state.resolvedTheme)
      return;
    this.state = next;
    for (const listener of [...this.listeners]) {
      if (this.disposed)
        return;
      try {
        listener();
      }
      catch (error) {
        console.error('theme subscriber failed:', error);
      }
    }
  }
}

/** Place this script in the HTML head before the application loads. */
export function getThemeScript(config: ThemeConfig = {}) {
  const serialized = JSON.stringify(resolveConfig(config)).replace(/</g, '\\u003c');
  return `(${applyTheme.toString()})(${serialized});`;
}

function resolveConfig(config: ThemeConfig): Required<ThemeConfig> {
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new TypeError('theme config must be an object');
  const {
    storageKey = 'react-cordis:theme',
    defaultTheme = 'system',
    attribute = 'data-theme',
    enableColorScheme = true,
  } = config;
  if (typeof storageKey !== 'string' || !storageKey.trim())
    throw new TypeError('theme storageKey must be a non-empty string');
  if (!['light', 'dark', 'system'].includes(defaultTheme))
    throw new TypeError('theme defaultTheme must be light, dark or system');
  if (typeof attribute !== 'string' || (attribute !== 'class' && !/^data-[a-z][a-z0-9-]*$/.test(attribute)))
    throw new TypeError('theme attribute must be class or a lowercase data-* attribute');
  if (typeof enableColorScheme !== 'boolean')
    throw new TypeError('theme enableColorScheme must be a boolean');
  return { storageKey, defaultTheme, attribute, enableColorScheme };
}

// Keep this function self-contained: the bootstrap serializes the same DOM logic.
function applyTheme(config: Required<ThemeConfig>, value?: string | null): ThemeSnapshot {
  if (value === undefined) {
    try {
      value = localStorage.getItem(config.storageKey);
    }
    catch {}
  }
  const preference = value === 'light' || value === 'dark' || value === 'system' ? value : config.defaultTheme;
  const resolvedTheme = preference === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  const root = document.documentElement;
  if (config.attribute === 'class') {
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
  }
  else {
    root.setAttribute(config.attribute, resolvedTheme);
  }
  if (config.enableColorScheme)
    root.style.colorScheme = resolvedTheme;
  return Object.freeze({ preference, resolvedTheme });
}
