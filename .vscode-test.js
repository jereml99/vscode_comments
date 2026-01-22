const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
    files: 'out/test/**/*.test.js',
    workspaceFolder: '.', // Open the root of the repo as workspace
    extensionDevelopmentPath: __dirname,
});
