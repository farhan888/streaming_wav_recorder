const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: "production", // You might want to use 'development' for local development
    entry: {
        // index: './src/index.js',
        mic: './src/customMic.js'
        // print: './src/print.js',
    },
    plugins: [
        // new HtmlWebpackPlugin({
        //     title: 'Output Management',
        // }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'src/recorder.worklet.js', to: 'recorder.worklet.js' }
            ],
        }),
    ],
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        library: 'CustomMic',
        libraryTarget: 'umd',
        globalObject: 'this',
        clean: true,
    },
    // devServer: {
    //     static: './dist',
    //     port: 9000,
    // },
    // optimization: {
    //     runtimeChunk: 'single',
    //   },
};
