// @vitest-environment jsdom

import type { ThemeConfig } from './theme';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as themeModule from './theme';

class MediaQuery {
  matches = true;
  listeners = new Set<() => void>();
  addEventListener(_type: string, listener: () => void) { this.listeners.add(listener); }
  removeEventListener(_type: string, listener: () => void) { this.listeners.delete(listener); }
  emit(matches: boolean) {
    this.matches = matches;
    for (const listener of this.listeners) listener();
  }
}

describe('themeRuntime', () => {
  let media: MediaQuery;
  let runtimes: themeModule.ThemeRuntime[];
  const createTheme = (config?: ThemeConfig) => {
    const runtime = new themeModule.ThemeRuntime(config);
    runtimes.push(runtime);
    return runtime;
  };
  const storage = (key: string | null, newValue: string | null) => window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-mode');
    document.documentElement.className = '';
    document.documentElement.style.cssText = '';
    media = new MediaQuery();
    runtimes = [];
    vi.stubGlobal('matchMedia', () => media);
  });
  afterEach(() => {
    for (const runtime of runtimes.reverse()) runtime.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves system changes while preserving the selected preference', () => {
    const theme = createTheme();
    expect(theme.snapshot).toEqual({ preference: 'system', resolvedTheme: 'dark' });
    media.emit(false);
    expect(theme.snapshot).toEqual({ preference: 'system', resolvedTheme: 'light' });
    theme.setTheme('dark');
    media.emit(false);
    expect(theme.snapshot.resolvedTheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('uses configured storage, default, attribute and color-scheme policy', () => {
    localStorage.setItem('example:theme', 'invalid');
    document.documentElement.style.colorScheme = 'light dark';
    const theme = createTheme({ storageKey: 'example:theme', defaultTheme: 'light', attribute: 'data-mode', enableColorScheme: false });
    expect(theme.snapshot.preference).toBe('light');
    theme.setTheme('dark');
    expect(localStorage.getItem('example:theme')).toBe('dark');
    expect(localStorage.getItem('react-cordis:theme')).toBeNull();
    expect(document.documentElement.dataset.mode).toBe('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light dark');
  });

  it('syncs storage changes and resets to the configured default without writing back', () => {
    const theme = createTheme({ storageKey: 'example:theme', defaultTheme: 'light' });
    const subscriber = vi.fn();
    const unsubscribe = theme.subscribe(subscriber);
    storage('unrelated', 'dark');
    expect(subscriber).not.toHaveBeenCalled();
    storage('example:theme', 'dark');
    expect(theme.snapshot.resolvedTheme).toBe('dark');
    expect(localStorage.getItem('example:theme')).toBeNull();
    storage('example:theme', 'invalid');
    expect(theme.snapshot.preference).toBe('light');
    storage('example:theme', 'system');
    expect(theme.snapshot.resolvedTheme).toBe('dark');
    storage(null, null);
    expect(theme.snapshot.preference).toBe('light');
    expect(subscriber).toHaveBeenCalledTimes(4);
    unsubscribe();
    theme.setTheme('dark');
    expect(subscriber).toHaveBeenCalledTimes(4);
  });

  it('ignores storage events from sessionStorage', () => {
    const theme = createTheme({ defaultTheme: 'light' });
    window.dispatchEvent(new StorageEvent('storage', { key: 'react-cordis:theme', newValue: 'dark', storageArea: sessionStorage }));
    expect(theme.snapshot.preference).toBe('light');
  });

  it('keeps snapshots immutable and skips unchanged notifications', () => {
    const theme = createTheme();
    const snapshot = theme.snapshot;
    const subscriber = vi.fn();
    theme.subscribe(subscriber);
    theme.setTheme('system');
    expect(theme.snapshot).toBe(snapshot);
    expect(subscriber).not.toHaveBeenCalled();
    expect(() => Object.assign(snapshot, { preference: 'light' })).toThrow();
  });

  it.each(['selection', 'system', 'storage'])('continues notifying after a subscriber throws during %s changes', (source) => {
    const theme = createTheme();
    const failure = new Error('broken subscriber');
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    theme.subscribe(() => {
      throw failure;
    });
    const observed: themeModule.ThemeSnapshot[] = [];
    const stop = theme.subscribe(() => observed.push(theme.snapshot));

    expect(() => {
      if (source === 'system')
        media.emit(false);
      else if (source === 'storage')
        storage('react-cordis:theme', 'light');
      else
        theme.setTheme('light');
    }).not.toThrow();

    expect(observed).toEqual([theme.snapshot]);
    expect(theme.snapshot.resolvedTheme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(report).toHaveBeenCalledWith('theme subscriber failed:', failure);
    stop();
    theme.setTheme('dark');
    expect(observed).toHaveLength(1);
  });

  it('stops the current notification round when a subscriber disposes the runtime', () => {
    const theme = createTheme();
    theme.subscribe(() => theme.dispose());
    const later = vi.fn();
    theme.subscribe(later);

    theme.setTheme('light');

    expect(later).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    theme.subscribe(later);
    theme.setTheme('dark');
    expect(later).not.toHaveBeenCalled();
  });

  it('exposes the latest snapshot after a subscriber changes the theme again', () => {
    const theme = createTheme({ defaultTheme: 'light' });
    theme.subscribe(() => {
      if (theme.snapshot.preference === 'dark')
        theme.setTheme('light');
    });
    const observed: string[] = [];
    theme.subscribe(() => observed.push(theme.snapshot.preference));

    theme.setTheme('dark');

    expect(observed).toEqual(['light', 'light']);
    expect(theme.snapshot.preference).toBe('light');
    expect(localStorage.getItem('react-cordis:theme')).toBe('light');
  });

  it('restores only its owned DOM state and makes disposal final', () => {
    const root = document.documentElement;
    root.className = 'host light';
    root.style.setProperty('color-scheme', 'light dark', 'important');
    const theme = createTheme({ attribute: 'class' });
    expect(root.className).toBe('host dark');
    root.classList.add('later');
    theme.dispose();
    expect(root.classList.contains('light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.classList.contains('later')).toBe(true);
    expect(root.style.colorScheme).toBe('light dark');
    expect(root.style.getPropertyPriority('color-scheme')).toBe('important');
    theme.setTheme('system');
    theme.setTheme('dark');
    storage('react-cordis:theme', 'light');
    media.emit(false);
    theme.dispose();
    expect(media.listeners.size).toBe(0);
    expect(localStorage.length).toBe(0);
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('restores a pre-existing data attribute on disposal', () => {
    document.documentElement.dataset.theme = 'host';
    createTheme().dispose();
    expect(document.documentElement.dataset.theme).toBe('host');
  });

  it.each([null, [], { storageKey: '' }, { defaultTheme: 'blue' }, { attribute: 'onclick' }, { attribute: 'data-' }, { enableColorScheme: 'yes' }].map(config => ({ config })))('rejects invalid config $config before changing the DOM', ({ config }) => {
    expect(() => createTheme(config as ThemeConfig)).toThrow(TypeError);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('rejects invalid theme values without corrupting state or storage', () => {
    const theme = createTheme();
    expect(() => theme.setTheme('blue' as 'dark')).toThrow(TypeError);
    expect(theme.snapshot.preference).toBe('system');
    expect(localStorage.length).toBe(0);
  });

  it('keeps working when localStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const theme = createTheme({ defaultTheme: 'light' });
    expect(theme.snapshot.resolvedTheme).toBe('light');
    expect(() => theme.setTheme('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it.each(['class', 'data-mode'] as const)('executes the generated %s bootstrap with the runtime configuration', (attribute) => {
    const key = 'example:</script><script>throw new Error("injected")</script>';
    const config = { storageKey: key, defaultTheme: 'light' as const, attribute };
    localStorage.setItem(key, 'system');
    const doc = new DOMParser().parseFromString(`<html class="host"><head><script>${themeModule.getThemeScript(config)}</script></head><body></body></html>`, 'text/html');
    expect(doc.querySelectorAll('script')).toHaveLength(1);
    runInNewContext(doc.querySelector('script')!.textContent!, { document: doc, window, localStorage });
    expect(doc.documentElement.getAttribute(attribute)).toBe(attribute === 'class' ? 'host dark' : 'dark');
    expect(doc.documentElement.style.colorScheme).toBe('dark');
    const runtime = createTheme(config);
    expect(runtime.snapshot).toEqual({ preference: 'system', resolvedTheme: 'dark' });
  });
});
