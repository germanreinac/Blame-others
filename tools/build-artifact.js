#!/usr/bin/env node
// Bundles index.html + src/game.js into one self-contained page (three.js from a CDN).
// Usage: node tools/build-artifact.js <output.html>
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const game = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');
const part = (name) => html.split(`<!--${name}-->`)[1].split(`<!--/${name}-->`)[0].trim();
const body = part('BODY')
  .replace('<script src="vendor/three.min.js"></script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>')
  .replace('<script src="src/game.js"></script>', () => `<script>\n${game}\n</script>`);
const out = process.argv[2];
if (!out) throw new Error('output path required');
fs.writeFileSync(out, part('HEAD') + '\n' + body + '\n');
console.log('wrote', out);
