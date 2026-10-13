/** Корневой layout приложения Personal CDN Zero. */
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Personal CDN Zero — ваш личный CDN. Бесплатно. Без API.',
  description:
    'Доставка контента с любых облаков (Dropbox, Google Drive, OneDrive, Яндекс.Диск, MEGA) через прямые ссылки. Без OAuth, без ключей API, без платных тарифов.',
  keywords: ['cdn', 'бесплатный cdn', 'dropbox cdn', 'google drive cdn', 'onedrive cdn', 'яндекс диск cdn', 'samp launcher'],
  openGraph: {
    title: 'Personal CDN Zero',
    description: 'Ваш личный CDN. Бесплатно. Без API.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/" className="text-lg font-bold">⚡ Personal <span className="text-brand-500">CDN Zero</span></a>
          <div className="flex gap-4 text-sm">
            <a href="/#how" className="hover:text-brand-500">Как это работает</a>
            <a href="/#clouds" className="hover:text-brand-500">Облака</a>
            <a href="/dashboard" className="rounded-full bg-brand-500 px-4 py-1.5 font-semibold hover:bg-brand-600">
              Дашборд
            </a>
          </div>
        </nav>
        {children}
        <footer className="mx-auto max-w-5xl px-6 py-10 text-center text-xs text-slate-500">
          MIT License · Open Source · GitHub / Gitverse.ru · Никаких платных API — и мы не начинаем.
        </footer>
      </body>
    </html>
  );
}
