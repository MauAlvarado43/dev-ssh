import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const shared = { bundle: true, sourcemap: true, minify: !watch, logLevel: 'info' };
const builds = [
  {
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node20'
  },
  {
    ...shared,
    entryPoints: ['src/presentation/webview/main.ts'],
    outfile: 'dist/webview.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    loader: { '.css': 'css' }
  }
];

if (watch) {
  const contexts = await Promise.all(builds.map((build) => esbuild.context(build)));
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('Dev SSH is watching for changes...');
} else {
  await Promise.all(builds.map((build) => esbuild.build(build)));
}
