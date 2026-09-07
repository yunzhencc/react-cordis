// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import html from './index.html?raw';

const fontSizeKey = '@yunzhen/cordis-ui-theme:font-size';
const bootstrap = new DOMParser().parseFromString(html, 'text/html').querySelector('body > script:not([type])')?.textContent;

describe('theme bootstrap', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.cssText = '';
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['malformed', 'large'],
    ['non-finite', 'Infinity'],
    ['below range', '11'],
    ['above range', '18'],
  ])('uses 14px for a %s persisted font size', (_label, storedValue) => {
    if (storedValue !== null)
      localStorage.setItem(fontSizeKey, storedValue);

    window.eval(bootstrap ?? '');

    expect(document.documentElement.style.getPropertyValue('--app-content-font-size')).toBe('14px');
  });

  it.each(['12', '14', '15', '17'])('restores the valid persisted font size %s', (storedValue) => {
    localStorage.setItem(fontSizeKey, storedValue);

    window.eval(bootstrap ?? '');

    expect(document.documentElement.style.getPropertyValue('--app-content-font-size')).toBe(`${storedValue}px`);
  });
});
