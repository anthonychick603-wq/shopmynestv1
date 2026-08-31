// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      // React Native <Text> renders apostrophes safely as text. This rule is
      // useful for HTML/JSX output but creates false positives throughout the
      // native app's user-facing copy (don't, we're, seller's, etc.).
      'react/no-unescaped-entities': 'off',
    },
  },
]);
