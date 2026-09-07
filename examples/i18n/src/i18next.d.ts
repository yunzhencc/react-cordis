import type { greetingMessages } from '../plugins/greeting/src/locales';
import type { pageMessages } from '../plugins/page/src/locales';
import 'i18next';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: {
      greeting: typeof greetingMessages.en;
      page: typeof pageMessages.en;
    };
    strictKeyChecks: true;
  }
}
