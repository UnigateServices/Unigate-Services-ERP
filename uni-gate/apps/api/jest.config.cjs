/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
          // Type-check shared from source, so tests do not need a prior build of @unigate/shared.
          baseUrl: __dirname,
          paths: { '@unigate/shared': ['../../packages/shared/src/index.ts'] },
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@unigate/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/../test/jest.global-setup.ts',
  setupFiles: ['<rootDir>/../test/jest.setup.ts'],
};
