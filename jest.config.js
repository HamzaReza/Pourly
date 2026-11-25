/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/functions/',
    '<rootDir>/firebase/',
    '<rootDir>/android/',
    '<rootDir>/ios/',
    '<rootDir>/dist/',
  ],
  modulePathIgnorePatterns: ['<rootDir>/functions/', '<rootDir>/firebase/', '<rootDir>/dist/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/react-native-skia|@revenuecat/.*|zustand|i18next|react-i18next|firebase|@firebase/.*)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
