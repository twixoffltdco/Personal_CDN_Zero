#!/usr/bin/env node
/**
 * examples/samp-launcher/downloader.js — пример докачки файлов мода через Personal CDN Zero.
 *
 * Использование:
 *   node downloader.js manifest.json ./mods/
 *
 * Возможности: проверка md5, докачка по Range, прогресс-бар, ретраи, fallback-зеркала.
 * Только Node.js stdlib — никаких платных зависимостей.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [,, manifestPath = 'manifest.json', outDir = '.'] = process.argv;

/** Скачивание с поддержкой Range (докачка) и ретраями. */
async function download(url, target, expectedMd5, mirrors = [], retries = 3) {
  const tmp = target + '.part';
  let start = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const u = attempt > 1 && mirrors.length ? mirrors[(attempt - 2) % mirrors.length] : url;
    try {
      console.log(`⬇️  ${path.basename(target)} attempt ${attempt}: ${u.slice(0, 80)}…`);
      const res = await fetch(u, { headers: start > 0 ? { Range: `bytes=${start}-` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);

      // Если сервер не поддержал Range — начинаем с нуля
      if (start > 0 && res.status !== 206) start = 0;

      const stream = fs.createWriteStream(tmp, { flags: start ? 'a' : 'w' });
      let done = start;
      const total = start + Number(res.headers.get('content-length') || 0);
      const reader = res.body.getReader();
      for (;;) {
        const { value, done: fin } = await reader.read();
        if (fin) break;
        stream.write(value);
        done += value.length;
        process.stdout.write(`\r   ${(done / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} МБ (${((done / Math.max(total, 1)) * 100).toFixed(1)}%)   `);
      }
      await new Promise((r) => stream.end(r));
      process.stdout.write('\r');

      // Проверка md5 (если указана в манифесте)
      if (expectedMd5) {
        const md5 = await hashFile(tmp, 'md5');
        if (md5 !== expectedMd5.toLowerCase()) {
          fs.unlinkSync(tmp); start = 0;
          throw new Error(`md5 mismatch: ${md5} != ${expectedMd5}`);
        }
      }
      fs.renameSync(tmp, target);
      console.log(`✅ ${path.basename(target)} готов`);
      return true;
    } catch (e) {
      console.warn(`⚠️  ${e.message}`);
    }
  }
  console.error(`❌ Не удалось скачать ${target} после ${retries} попыток`);
  return false;
}

function hashFile(file, algo) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algo);
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  let ok = 0;
  for (const f of manifest.files) {
    const target = path.join(outDir, f.target || f.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Пропускаем уже скачанные файлы с правильной суммой
    if (fs.existsSync(target) && (!f.md5 || (await hashFile(target, 'md5')) === f.md5)) {
      console.log(`⏭️  ${f.name} — уже актуален`);
      ok++;
      continue;
    }
    if (await download(f.url, target, f.md5, f.mirrors)) ok++;
  }
  console.log(`\nГотово: ${ok}/${manifest.files.length}. Версия мода: ${manifest.version}`);
})();
