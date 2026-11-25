import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'README.md',
  'CONTRIBUTING.md',
  'docs/mo-rong-nghiep-vu.md',
  'docs/phan-tich-nghiep-vu.md',
  'docs/luong-trang-thai.md',
  'docs/lo-trinh-trien-khai.md',
  'docs/trai-nghiem-va-tinh-huong-bien.md',
  'docs/ra-soat-truoc-khi-lap-trinh.md',
];
let errors = 0;
for (const file of files) {
  const source = resolve(root, file);
  if (!existsSync(source)) {
    console.error(`Missing: ${file}`);
    errors++;
    continue;
  }
  const content = readFileSync(source, 'utf8');
  if (!content.startsWith('# ')) {
    console.error(`Missing heading: ${file}`);
    errors++;
  }
  for (const match of content.matchAll(/\[[^\]\n]+\]\(([^)]+)\)/g)) {
    const target = decodeURIComponent(match[1].split('#')[0]);
    if (!target || /^https?:\/\//.test(target)) continue;
    if (isAbsolute(target) || !existsSync(resolve(dirname(source), target))) {
      console.error(`Broken link: ${file} -> ${match[1]}`);
      errors++;
    }
  }
}
if (errors) process.exit(1);
console.log(`Checked ${files.length} documents and local links.`);
