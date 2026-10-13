# Пример интеграции: SA-MP лаунчер + Personal CDN Zero

SA-MP (San Andreas Multiplayer) лаунчеры скачивают файлы сервера по списку `files.ini`
(или аналогу в современных лаунчерах: `manifest.json`, `update.json`). Файлы должны
отдаваться с корректным `Content-Type` и без CORS-проблем — ровно то, что делает
наш edge-прокси. Бесплатное облако + Personal CDN Zero = свой загрузочный CDN для мода.

## 1. Классический files.ini (samp-launcher)

Выложите архив модов/клиента в Dropbox, получите прямую ссылку расширением, затем
впишите **CDN-ссылку** в `files.ini`:

```ini
; files.ini — стандартный формат SA-MP лаунчера
; синтаксис: <название|путь_на_клиенте> = <URL>|<md5 или remote checksum>

[player-models]
; Путь куда лаунчер сохранит файл | CDN-ссылка через Personal CDN Zero | контрольная сумма
models/player.zzz = https://cdn.example.personal/cdn/packs/file.ext?url=https%3A%2F%2Fdl.dropboxusercontent.com%2Fs%2Fabcd1234%2Fplayer.zzz%3Fdl%3D1|remote

[fonts]
fonts/custom.ttf = https://cdn.example.personal/cdn/packs/file.ext?url=https%3A%2F%2Fdrive.usercontent.google.com%2Fdownload%3Fid%3D1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms%26export%3Ddownload|remote

[objects]
mods/objectsonly.dff = https://cdn.example.personal/cdn/packs/file.ext?url=https%3A%2F%2Fonedrive.live.com%2Fdownload%3Fcresid%3Db%2521cid-abc%2521123%26authkey%3Dxyz|remote
```

> `|remote` заставляет лаунчер брать контрольную сумму из заголовков/первого скачивания.
> Если лаунчер требует строгий md5 — положите рядом `checksums.json` (см. ниже) и
> используйте скрипт докачки из этого примера.

## 2. Современный лаунчер: manifest.json + скрипт докачки

Многие кастомные лаунчеры читают JSON-манифест. Пример `manifest.json`:

```json
{
  "version": "1.4.2",
  "files": [
    {
      "name": "client-mods.zip",
      "url": "https://cdn.example.personal/cdn/packs/file.ext?url=https%3A%2F%2Fdl.dropboxusercontent.com%2Fs%2Fabcd%2Fclient-mods.zip%3Fdl%3D1",
      "size": 104857600,
      "md5": "d41d8cd98f00b204e9800998ecf8427e",
      "target": "mods/client-mods.zip"
    }
  ]
}
```

Скрипт-докачка `downloader.js` (Node.js, можно встроить в свой лаунчер на Electron):
проверяет наличие файла, сравнивает md5, качает через наш CDN и показывает прогресс.

## 3. Почему это лучше «голых» ссылок облаков для SA-MP

| Проблема голой ссылки            | Решение через /api/cdn                     |
|----------------------------------|--------------------------------------------|
| Лаунчер не получает Content-Type | Прокси автоопределяет MIME по расширению   |
| Нет Accept-Ranges (нет докачки)  | Пробрасываем Range/Etag от облака          |
| Ссылка «светит» ваш аккаунт      | URL прокси не содержит логина              |
| Кэш-заголовки облаков агрессивны | Мы ставим свои Cache-Control               |

## 4. Ограничения

- Большие сборки (>1 ГБ) бесплатные облака могут резать по суточному трафику —
  разбивайте на части (`.z01/.z02`) или держите зеркало во втором облаке.
- После обновления файлов переснифьте ссылку расширением (особенно Яндекс.Диск).
