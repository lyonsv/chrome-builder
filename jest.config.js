module.exports = {
  testEnvironment: 'node',
  transform: {},
  setupFilesAfterEnv: ['./tests/setup/chrome-mock.js'],
  testMatch: ['**/tests/unit/**/*.test.js']
};
