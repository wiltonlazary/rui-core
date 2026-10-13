// Writes test/exports.lock.json from the package's entries as they are. The lock
// is the contract: regenerate it only for additions the user asked for
// (.ai/config/stability.md, from the rui repo root), and review the diff. Name entries
// (`node --import ren-core/loader scripts/lock.mjs ./hooks ./form`) to
// update only those and keep the others as locked.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const kind = v => (typeof v === 'function' ? (/^class\b/.test(Function.prototype.toString.call(v)) ? 'class' : 'function') : typeof v);
const file = 'test/exports.lock.json';
const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const only = process.argv.slice(2);
const lock = {};
for (const entry of Object.keys(pkg.exports)) {
  if (only.length > 0 && !only.includes(entry) && old[entry] !== undefined) {
    lock[entry] = old[entry];
    continue;
  }
  const m = await import(entry === '.' ? pkg.name : `${pkg.name}/${entry.slice(2)}`);
  lock[entry] = Object.fromEntries(Object.keys(m).sort().map(n => [n, kind(m[n])]));
}
writeFileSync(file, JSON.stringify(lock, null, 2) + '\n');
console.log(Object.entries(lock).map(([e, v]) => `${e}: ${Object.keys(v).length}`).join(', '));
