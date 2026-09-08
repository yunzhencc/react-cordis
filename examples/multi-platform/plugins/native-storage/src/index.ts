import type { Context } from '@deepseek-ai/cordis';
import { provideStorage } from '@examples/multi-platform-storage';
import { SQLiteStorage } from 'expo-sqlite/kv-store';

export const name = 'native-storage';
export function apply(ctx: Context) {
  // Keep Expo's original database name so the previous example's data remains readable.
  const storage = new SQLiteStorage('ExpoSQLiteStorage');
  provideStorage(ctx, {
    read: name => storage.getItem(`cordis-cross-platform:${name}`),
    write: (name, value) => storage.setItem(`cordis-cross-platform:${name}`, value),
    close: () => storage.close(),
  });
}
