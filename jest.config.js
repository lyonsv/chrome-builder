module.exports = {
  testEnvironment: 'node',
  transform: {},
  setupFiles: ['./tests/setup/chrome-mock.js'],
  testMatch: ['**/tests/unit/**/*.test.js']
};
