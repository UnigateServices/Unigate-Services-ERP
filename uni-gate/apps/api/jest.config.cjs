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
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@unigate/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/../test/jest.setup.ts'],
};
