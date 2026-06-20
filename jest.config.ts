import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/backend'],
  moduleDirectories: [
    'node_modules',
    'backend/node_modules',
  ],
  moduleNameMapper: {
    '^@backend/(.*)$': '<rootDir>/backend/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        target: 'ES2022',
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        skipLibCheck: true,
        strict: false,
        baseUrl: '.',
        ignoreDeprecations: '6.0',
        paths: {
          '@prisma/client': ['backend/node_modules/@prisma/client'],
        },
      },
    }],
  },
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
};

export default config;
