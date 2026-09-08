import type { ReactNode } from 'react';
import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui, isWeb, ScrollView, TamaguiProvider, Text, YStack } from 'tamagui';

const family = isWeb ? 'system-ui, sans-serif' : 'System';
const config = createTamagui({
  ...defaultConfig,
  settings: { ...defaultConfig.settings, onlyAllowShorthands: false },
  fonts: {
    ...defaultConfig.fonts,
    body: { ...defaultConfig.fonts.body, family },
    heading: { ...defaultConfig.fonts.heading, family },
  },
});

type UIConfig = typeof config;
declare module 'tamagui' {
  interface TamaguiCustomConfig extends UIConfig {}
}
export function Frame({ children, host }: { children: ReactNode; host: string }) {
  return (
    <TamaguiProvider config={config} defaultTheme="light">
      <ScrollView flex={1} backgroundColor="$gray2" contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <YStack width="100%" maxWidth={760} alignSelf="center" padding="$5" paddingTop="$9" gap="$7">
          {children}
          <Text color="$gray9" fontSize="$2">{host}</Text>
        </YStack>
      </ScrollView>
    </TamaguiProvider>
  );
}
