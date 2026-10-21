// Bundles src/main.js (three.js included) into one self-contained HTML file.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = '../Gabès Pitch 3D.html';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('src/template.html', 'utf8').split('/*BUNDLE*/').join(js);
writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${(html.length / 1024).toFixed(0)} KB)`);
