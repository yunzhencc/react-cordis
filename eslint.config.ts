import antfu from '@antfu/eslint-config';

export default antfu(
  {
    ignores: ['.superpowers/**', 'docs/**', '**/out/**', '**/.output/**', '**/routeTree.gen.ts', 'examples/multi-platform/apps/mobile/src/boot.generated.js'],
    stylistic: {
      semi: true,
      indent: 2,
      quotes: 'single',
    },
    react: true,
  },
  {
    files: ['packages/**/*.tsx', 'examples/*/plugins/**/*.tsx', 'examples/tanstack-start/src/plugins/**/*.tsx', 'examples/tanstack-start/src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['pnpm-workspace.yaml'],
    rules: {
      'pnpm/yaml-enforce-settings': 'off',
    },
  },
);
