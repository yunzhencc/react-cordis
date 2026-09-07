import antfu from '@antfu/eslint-config';

export default antfu(
  {
    ignores: ['.superpowers/**', 'docs/**', '**/out/**'],
    stylistic: {
      semi: true,
      indent: 2,
      quotes: 'single',
    },
    react: true,
  },
  {
    files: ['packages/**/*.tsx', 'examples/*/plugins/**/*.tsx'],
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
