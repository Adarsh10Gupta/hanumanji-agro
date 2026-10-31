import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoots = ['src', 'scripts'];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(fullPath));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

test('source files contain no replacement characters or common UTF-8 mojibake', async () => {
  const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
  const badEncoding = /\uFFFD|\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]|\u00E2\u20AC[\u0080-\u00BF]/u;
  const failures = [];

  for (const file of files) {
    const contents = await readFile(file, 'utf8');
    if (badEncoding.test(contents)) failures.push(file);
  }

  assert.deepEqual(failures, [], `Fix text encoding in: ${failures.join(', ')}`);
});
