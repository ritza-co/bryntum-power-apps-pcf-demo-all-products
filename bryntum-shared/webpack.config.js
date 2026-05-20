const path = require('path');

module.exports = {
  entry: './src/all.js',
  output: {
    filename: 'bryntum.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  module: {
    rules: [
      {
        // Bryntum's locale files are UMD-wrapped — they register themselves via
        // LocaleHelper.publishLocale() as a side effect during evaluation, but
        // have no ESM exports. Without this rule, webpack tree-shakes them
        // (the "module has no exports" warning becomes a silent drop) and
        // Bryntum renders with `L{}` placeholders + throws "this.L(...) is not
        // a function" during render. Marking them as side-effectful forces
        // webpack to keep the IIFE evaluation.
        test: /\.locale\.[A-Za-z]+\.js$/,
        sideEffects: true,
      },
    ],
  },
  performance: {
    hints: false,
  },
};
