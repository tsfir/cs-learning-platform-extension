const path = require('path');

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'node',
  entry: {
    extension: './src/extension.ts',
    webview: './src/webview/index.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  optimization: {
    minimize: true,
    usedExports: true
  }
};

module.exports = config;
