const path = require('node:path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

module.exports = (_env, argv) => ({
  entry: './src/main.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'assets/[name].[contenthash].js',
    publicPath: '/',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: { '#': path.resolve(__dirname, 'src'), '@': path.resolve(__dirname, 'src') },
  },
  module: {
    rules: [
      { test: /\.tsx?$/, exclude: /node_modules/, use: { loader: 'ts-loader', options: { transpileOnly: true, compilerOptions: { noEmit: false } } } },
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, 'css-loader'] },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({ template: './index.html' }),
    new MiniCssExtractPlugin({ filename: 'assets/[name].[contenthash].css' }),
  ],
  devtool: argv.mode === 'production' ? false : 'source-map',
  devServer: {
    host: '127.0.0.1', port: 3000,
    historyApiFallback: true,
    proxy: [{ context: ['/api'], target: process.env.DEV_API_URL || 'http://127.0.0.1:3001', proxyTimeout: 900000 }],
  },
})
