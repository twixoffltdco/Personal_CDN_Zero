/** Лендинг Personal CDN Zero — серверный компонент, без JS-бандла. */
import Link from 'next/link';

const STEPS = [
  { n: 1, t: 'Откройте файл в облаке', d: 'Dropbox, Google Drive, OneDrive, Яндекс.Диск или MEGA — бесплатный тариф подойдёт.' },
  { n: 2, t: 'Нажмите кнопку в расширении', d: '«⚡ Отправить в Personal CDN» — сниффер сам найдёт прямую ссылку на скачивание.' },
  { n: 3, t: 'Получите CDN-ссылку', d: 'Edge-прокси отдаёт файл с CORS и годовым кэшем. Вставляйте куда угодно.' },
];

const CLOUDS = [
  { name: 'Dropbox', note: 'dl.dropboxusercontent.com — стабильные прямые ссылки ?dl=1' },
  { name: 'Google Drive', note: 'drive.usercontent.google.com/download?id=… — публичные файлы' },
  { name: 'OneDrive', note: 'onedrive.live.com/download?cid=…&resid=… — shared-ссылки' },
  { name: 'Яндекс.Диск', note: 'downloader.disk.yandex.ru — подпись живёт ~минуты, обновляйте через расширение' },
  { name: 'MEGA', note: 'client-side encryption: ссылка file/ID#key для скачивания по клику' },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6">
      {/* HERO */}
      <section className="py-16 text-center md:py-24">
        <p className="mb-3 inline-block rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-brand-500">
          No API · No OAuth · No App Keys · $0
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight md:text-6xl">
          Ваш личный CDN.<br /><span className="text-brand-500">Бесплатно. Без API.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-slate-400 md:text-lg">
          Превратите бесплатное облачное хранилище в полноценный CDN для сайтов, SA-MP лаунчеров,
          WordPress и статических страниц. Edge-прокси стримит файлы по прямым ссылкам и добавляет
          CORS + кэш-заголовки. Никаких регистраций в консолях разработчиков.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className="btn-primary">🚀 Открыть дашборд</Link>
          <a href="/#install" className="btn-ghost">Установить расширение</a>
        </div>
        <p className="mono mt-6 text-xs text-slate-500">
          https://ваш-cdn.example/cdn/packs/file.zip?url=https%3A%2F%2Fdl.dropboxusercontent.com%2Fs%2F...%3Fdl%3D1
        </p>
      </section>

      {/* КАК ЭТО РАБОТАЕТ */}
      <section id="how" className="py-12">
        <h2 className="mb-8 text-center text-2xl font-bold md:text-3xl">Как это работает без API</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 font-bold">{s.n}</div>
              <h3 className="mb-2 font-semibold">{s.t}</h3>
              <p className="text-sm text-slate-400">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="card mt-5 text-sm leading-relaxed text-slate-300">
          <p className="font-semibold text-white mb-2">Под капотом — никакой магии и никаких ключей:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Расширение-сниффер находит <b>прямую ссылку на скачивание</b> в DOM и сетевых запросах страницы облака (по aria-label, data-атрибутам и download-хостам — не по CSS-классам).</li>
            <li>Ссылка попадает на ваш сайт (runtime.sendMessage / clipboard) и сохраняется в IndexedDB — на сервере не хранится ничего.</li>
            {/* {folder}/{filename} — JSX-строка, фигурные скобки внутри текста */}
            <li>Edge-прокси <span className="mono">{'/cdn/{folder}/{filename}?url=…'}</span> делает fetch к облаку от имени сервера (ТОЛЬКО прямые ссылки облаков — сторонние CDN не проксируются), стримит бинарный поток клиенту и навешивает <span className="mono">Access-Control-Allow-Origin: *</span>, <span className="mono">Cache-Control: public, max-age=31536000, immutable</span> и <span className="mono">Accept-Ranges: bytes</span>.</li>
            <li>Rate limiting 100 req/min per IP защищает прокси от злоупотреблений. Протухшая ссылка → честный 404 «Обновите ссылку через расширение».</li>
          </ol>
        </div>
      </section>

      {/* ПОДДЕРЖИВАЕМЫЕ ОБЛАКА */}
      <section id="clouds" className="py-12">
        <h2 className="mb-8 text-center text-2xl font-bold md:text-3xl">Поддерживаемые облака</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {CLOUDS.map((c) => (
            <div key={c.name} className="card flex items-start gap-4">
              <span className="text-2xl">☁️</span>
              <div>
                <h3 className="font-semibold">{c.name}</h3>
                <p className="text-sm text-slate-400">{c.note}</p>
              </div>
            </div>
          ))}
          <div className="card flex items-center gap-4 border-dashed">
            <span className="text-2xl">➕</span>
            <p className="text-sm text-slate-400">
              Любое облако с публичными ссылками. Если оно отдаёт файл по URL — прокси его стримит.
              Свой content script добавляется за 20 строк (см. <span className="mono">extension/content/</span>).
            </p>
          </div>
        </div>
      </section>

      {/* УСТАНОВКА РАСШИРЕНИЯ */}
      <section id="install" className="py-12">
        <h2 className="mb-8 text-center text-2xl font-bold md:text-3xl">Установка расширения</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['Chrome', 'chrome://extensions → режим разработчика → «Загрузить распакованную» → папка extension/'],
            ['Firefox', 'about:debugging → This Firefox → «Загрузить временное дополнение» → manifest.json'],
            ['Edge', 'edge://extensions → Developer mode → «Распаковать расширение» → папка extension/'],
            ['Safari', 'xcrun safari-web-extension-converter extension/ → Xcode → Build and Run'],
          ].map(([b, d]) => (
            <div key={b} className="card">
              <h3 className="mb-2 font-semibold text-brand-500">{b}</h3>
              <p className="text-xs text-slate-400">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          Нет расширения? Не проблема: откройте <Link href="/dashboard" className="text-brand-500 underline">дашборд</Link> и
          вставьте прямую ссылку вручную — гостевой режим работает сразу.
        </p>
      </section>

      {/* ИНТЕГРАЦИИ */}
      <section className="py-12">
        <h2 className="mb-8 text-center text-2xl font-bold md:text-3xl">Примеры интеграции</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card">
            <h3 className="mb-2 font-semibold">🎮 SA-MP лаунчер</h3>
            <p className="text-sm text-slate-400">FILES.ini и моды по CDN-ссылкам: скачивание с нужным Content-Type и без CORS-проблем.</p>
            <p className="mono mt-2 text-xs text-brand-500">examples/samp-launcher/</p>
          </div>
          <div className="card">
            <h3 className="mb-2 font-semibold">📝 WordPress</h3>
            <p className="text-sm text-slate-400">Плагин-шорткод <span className="mono">[pcdn url="…"]</span> для медиа из вашего облака.</p>
            <p className="mono mt-2 text-xs text-brand-500">examples/wordpress/</p>
          </div>
          <div className="card">
            <h3 className="mb-2 font-semibold">🌐 Статические сайты</h3>
            <p className="text-sm text-slate-400">&lt;img&gt;, &lt;video&gt;, fetch(), шрифты — любой кросс-доменный ресурс через один URL.</p>
            <p className="mono mt-2 text-xs text-brand-500">examples/static-site/</p>
          </div>
        </div>
      </section>

      {/* ОГРАНИЧЕНИЯ — честно */}
      <section className="py-12">
        <div className="card border-amber-500/30">
          <h2 className="mb-3 text-xl font-bold text-amber-400">⚠️ Ограничения прямых ссылок — читаем до использования</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
            <li><b>Срок жизни подписей.</b> Яндекс.Диск выдаёт downloader-URL с подписью на несколько минут; Dropbox и GDrive — «вечные» публичные ссылки. Протухшую ссылку обновите одним кликом расширения.</li>
            <li><b>Лимиты облаков.</b> Бесплатные тарифы режут дневной трафик (у GDrive ~10 ГБ/сутки на файл). Это ограничение облака, а не нашего прокси.</li>
            <li><b>Приватные файлы.</b> Работаем только с тем, что уже публично доступно по ссылке. Мы не обходим чужие защиты и не крадём приватное.</li>
            <li><b>Изменения верстки.</b> Облака редизайнятся; селекторы по aria/data переживают это лучше классов, но патчи приветствуются — это open source.</li>
            <li><b>Не для тяжёлых продакшенов.</b> Личный CDN для своих файлов, а не замена Cloudflare на 10 ТБ. Rate limit 100 req/min оставлен специально.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
