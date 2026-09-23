#!/usr/bin/env node
// scripts/build.mjs - generate index.html from zombie-hero-match.html
//
// v7 kept two byte-identical 79 KB HTML files in git and a test that asserted
// they matched. That works right up until someone edits one of them by hand.
// This makes the relationship explicit: `zombie-hero-match.html` is the source,
// `index.html` is a build artefact that GitHub Pages serves at the site root.
//
//   node scripts/build.mjs          # write index.html
//   node scripts/build.mjs --check  # exit 1 if index.html is stale (CI gate)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'zombie-hero-match.html');
const OUT = join(root, 'index.html');

const src = readFileSync(SRC, 'utf8');
let current = null;
try { current = readFileSync(OUT, 'utf8'); } catch { /* missing is fine */ }

if (process.argv.includes('--check')) {
  if (current !== src) {
    console.error('index.html is stale - run: npm run build');
    process.exit(1);
  }
  console.log('index.html is up to date (' + src.length + ' bytes)');
} else {
  writeFileSync(OUT, src);
  console.log('wrote index.html (' + src.length + ' bytes)');
}
