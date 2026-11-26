// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'functions/*',
      'firebase/*',
      'public/*',
      'dist/*',
      'android/*',
      'ios/*',
      '.expo/*',
      'expo-env.d.ts',
    ],
  },
  {
    // Text goes through the design system's Text, which applies the UI typeface (src/ui/fonts.ts).
    files: ['app/**/*.tsx', 'src/ui/**/*.tsx'],
    ignores: ['src/ui/Text.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text'],
              message: "Import Text from '@/ui/Text' so it uses the app's typeface.",
            },
          ],
        },
      ],
    },
  },
]);
