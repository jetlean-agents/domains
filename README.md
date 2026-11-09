## JetLean Domains — проверка доступности доменов

Этап 1 (MVP): API + веб-UI массовой проверки доступности доменов через
DNS → RDAP → whois, с кэшем в Postgres и rate-limit по серверам.

### Стек

TypeScript, Node 22 (разработка велась на Node 20 — совместимо, `engines`
указывает `>=20`), Fastify, Postgres (`pg`, миграции — SQL-файлы в
`src/db/migrations`), без Redis.

### Быстрый старт (локально)

```bash
cp .env.example .env   # заполнить DATABASE_URL / ADMIN_TOKEN
npm install
npm run build && npm start
# или для разработки:
npm run dev
```

Миграции применяются автоматически при старте (`npm start` / `npm run dev`).

### API

- `GET /api/v1/check?d=a.com,b.com.ua&deep=0|1` — до 100 доменов через запятую.
- `POST /api/v1/check` — JSON `{ "domains": ["a.com", "b.com.ua"], "deep": false }`.
- `GET /healthz` — без авторизации.

Авторизация — `Authorization: Bearer <token>` (или cookie `token` после входа
через UI). Ответ на каждый домен:

```json
{
  "domain": "example.com",
  "status": "available | registered | pending_delete | redemption | unknown",
  "expires_at": "2027-01-01T00:00:00.000Z",
  "registrar": "Example Registrar",
  "source": "dns | rdap | whois | cache",
  "checked_at": "2026-11-09T10:00:00.000Z"
}
```

`?deep=1` (или `"deep": true`) всегда идёт в RDAP/whois за датой и
регистратором, даже если домен уже выглядит делегированным по DNS.

### Токены

```bash
npm run token:create -- --name autoreg
npm run token:create -- --name admin-ui --admin
npm run token:list
npm run token:revoke -- --name autoreg   # или --id <uuid>
```

На собранном образе (prod/stage) эти команды выполняют скомпилированный
`dist/scripts/*.js` (`tsx` в рантайм-образе нет): `docker compose exec app npm
run token:create -- --name autoreg` — см. `docs/deploy.md`. В dev-режиме без
сборки есть `token:create:dev` / `token:revoke:dev` / `token:list:dev` (через
`tsx`).

Токен выводится один раз и хранится в БД только как SHA-256 хэш. Токен из
`ADMIN_TOKEN` (ENV) работает всегда, без записи в БД — это bootstrap-доступ
для первого входа.

### Тесты

```bash
npm test   # vitest run --maxWorkers=2
```

Покрывают: нормализацию доменов (IDN/punycode, публичные суффиксы включая
`.com.ua`), маппинг RDAP-статусов, парсеры whois (`.com`, `.com.ua`, `.de`,
`.io`, registered + available) на фикстурах из `test/fixtures/whois`, и
rate-limiter (конкурентность + ретраи).

### Документация

- [`docs/deploy.md`](docs/deploy.md) — stage/prod деплой.
- [`docs/env.md`](docs/env.md) — переменные окружения.

### Scope этапа 1 / не входит

Лента дропов, CZDS, оценка доменов, вотчлист, Telegram, интеграция с Autoreg —
следующие этапы.

## Этап 2 — лента дропов

Источники: ежедневный diff файлов зон (ICANN CZDS или локальные тестовые
файлы), импорт CSV (ExpiredDomains / GoDaddy / Dynadot / generic, вручную и по
URL-расписанию), периодическая перепроверка `.ua`/`.com.ua` через RDAP-пайплайн
этапа 1. Плюс API/UI ленты с фильтрами и админ-API сервисных токенов.

### API

- `GET /api/v1/drops?tld=&source=&since=&q=&min_len=&max_len=&no_digits=&no_hyphens=&limit=&cursor=`
  — список дропов; пагинация offset-based (`cursor` — предыдущий offset,
  следующий возвращается в `next_cursor`). `?check=1` дополнительно
  перепроверяет текущий статус выдачи (до 100 доменов на странице) через
  пайплайн этапа 1 и добавляет `current_status` в каждую запись.
- `GET /api/v1/drops/export.csv` — те же фильтры, CSV-поток.
- `POST /api/v1/imports` — загрузка CSV (`Content-Type: text/csv`, тело — сырой
  CSV-текст); провайдер определяется автоматически по заголовку (см.
  `src/csvimport/column-map.ts`) либо используется generic-формат
  `domain[,drop_date,...]`.
- `POST/GET/DELETE /api/v1/admin/tokens` и `POST /api/v1/admin/ua-watchlist` —
  только с заголовком `Authorization: Bearer <ADMIN_TOKEN>` (bootstrap-токен
  из ENV, не сервисный токен из БД).
- UI: `/drops` (фильтры, выбор доменов → проверка доступности, загрузка CSV),
  `/admin/tokens` (создание/просмотр/отзыв сервисных токенов и seed
  `.ua`-вотчлиста — требует реальный `ADMIN_TOKEN`, вводится прямо на странице).

Новые переменные окружения — см. [`docs/env.md`](docs/env.md) (`CZDS_*`,
`ZONE_*`, `CSV_IMPORT_*`, `UA_WATCH_CRON`).

### Zone diff и .ua watch вручную

```bash
npm run zone:diff:dev -- --tld test        # или без --tld — все CZDS_ZONES
npm run ua:seed:dev -- --domain example.ua
npm run zone:memcheck                      # проверка памяти на ~1М строк зоны
```

### Тесты этапа 2

Покрывают: парсинг BIND zone-файлов (`$ORIGIN`, относительные/абсолютные
имена, дубликаты NS-записей), diff снимков на фикстурах `test/fixtures/zones`
(day1/day2 — порядок строк и дубли не влияют на результат), автоопределение
CSV-провайдера (ExpiredDomains/GoDaddy/Dynadot + generic) и дедуп, переходы
статусов `.ua`-вотчлиста (какие именно считаются дропом), построитель
фильтров `GET /api/v1/drops`, и что `requireAdminToken` требует именно
`ADMIN_TOKEN`, а не сервисный токен из БД.

### Scope этапа 2 / не входит

Оценка доменов (Wayback/Common Crawl), вотчлист с уведомлениями в Telegram,
интеграция с Autoreg — следующие этапы. Реальные CZDS-креды пока не выданы —
zone diff работает на тестовых файлах (`ZONE_FILES_DIR`).

## Этап 3 — оценка домена (Wayback, Common Crawl, балл и ниша)

История домена (Wayback CDX + выборка снимков по годам, язык/тематика/спам
по ключевым словам) и дешёвая оценка присутствия в вебе (Common Crawl Index
API — честно не претендует на точные backlinks, см.
[`docs/evaluation.md`](docs/evaluation.md) про ограничения) сводятся в балл
0–100 с разбивкой и нишу `auto | energy | news | deals_us | none`. Плюс хвост
этапа 2: имя сервисного токена снова можно использовать после `revoke`
(уникальность — только среди активных токенов).

### API

- `POST /api/v1/evaluate` — `{ "domains": [...] }` (до 20), асинхронно:
  создаёт job, оценка идёт в фоне. Ответ `202 { job_id, status }`.
- `GET /api/v1/evaluate/:id` — статус и результаты job.
- `GET /api/v1/evaluations?domain=a.com,b.com` — уже сохранённые оценки из БД,
  без новых запросов к Wayback/Common Crawl.
- `GET /api/v1/drops` — новые фильтры `niche=`, `min_score=`, `min_age=` и
  `sort=score`.
- UI: колонки «Балл» / «Ниша» / «Возраст» и те же фильтры на `/drops`,
  кнопка «Оценить» там же; страница `/domains/:domain` — разбивка балла,
  флаги (`spam`, `topic_change`, `parked`, `no_history`), ссылки на первый и
  последний снимок Wayback.
- Фоновая автооценка новых дропов по cron (`EVAL_CRON`), с лимитом
  `EVAL_DAILY_LIMIT` свежих оценок в сутки.

Новые переменные окружения — см. [`docs/env.md`](docs/env.md)
(`WAYBACK_*`, `CC_*`, `EVAL_*`). Формула балла, словари ниш/спама и честные
ограничения оценки ссылок — [`docs/evaluation.md`](docs/evaluation.md).

### Тесты этапа 3

Формула балла (`computeScore`/`detectFlags`) и классификатор ниш/спама/парковки
на фикстурах сохранённых HTML-снимков (`test/fixtures/wayback/*.html`, по
странице на каждую нишу + спам + parked), парсинг Wayback CDX-ответа на
фикстуре, глобальная очередь с минимальным интервалом (`MinIntervalQueue`) —
конкурентность и ретраи, фильтры `niche`/`min_score`/`min_age` для `/drops`.
Внешние сервисы (Wayback, Common Crawl) в тестах не вызываются — тестируются
только чистые функции разбора/классификации/подсчёта балла.

### Scope этапа 3 / не входит

Платные SEO-API (Ahrefs, Majestic и т.п.), вотчлист и уведомления в Telegram,
интеграция с Autoreg — следующий этап.
