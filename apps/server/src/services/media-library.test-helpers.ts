import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnR6QAAAABJRU5ErkJggg==';
const TINY_PNG = Buffer.from(TINY_PNG_BASE64, 'base64');

export async function createMediaFixtureTree() {
  const rootDir = await mkdtemp(join(tmpdir(), 'media-library-'));

  const files = [
    '2026/04/09/A款/001.png',
    '2026/04/09/A款/002.png',
    '2026/04/09/B款/010.png',
    '2026/04/09/B款/readme.txt',
    '2026/04/10/C款/003.png',
    '2026年/4月/0409男装/女装A/101.png',
    '2026年/4月/0409男装/女装B/102.png',
    '2026年/4月/0407/女装A/103.png',
    '2025年/12月/12.31男装/西装A/104.png',
    '2020年/0404/老款A/105.png',
    '2025/12/18/圣诞道具/004.png',
    '2025/not-a-month/ignored/005.png',
    'misc/random/006.png',
  ];

  for (const relativePath of files) {
    const fullPath = join(rootDir, relativePath);
    await mkdir(join(fullPath, '..'), { recursive: true });

    if (relativePath.endsWith('.png')) {
      await writeFile(fullPath, TINY_PNG);
    } else {
      await writeFile(fullPath, 'ignore me');
    }
  }

  return {
    rootDir,
    async cleanup() {
      await rm(rootDir, { recursive: true, force: true });
    },
  };
}
