## Переменные окружения

| Переменная | Обязательна | По умолчанию | Описание |
|---|---|---|---|
| `DATABASE_URL` | да | — | строка подключения Postgres, `postgres://user:pass@host:5432/db` |
| `PORT` | нет | `3000` | порт, на котором слушает приложение внутри контейнера |
| `ADMIN_TOKEN` | нет | — | bootstrap-токен администратора; не хранится в БД, сверяется напрямую из ENV |
| `CACHE_TTL_REGISTERED` | нет | `86400` (24ч) | TTL кэша (сек) для `registered` / `pending_delete` / `redemption` |
| `CACHE_TTL_AVAILABLE` | нет | `10800` (3ч) | TTL кэша (сек) для `available` |
| `CACHE_TTL_UNKNOWN` | нет | `900` (15мин) | TTL кэша (сек) для `unknown` |
| `RDAP_TIMEOUT_MS` | нет | `5000` | таймаут одного RDAP-запроса |
| `WHOIS_TIMEOUT_MS` | нет | `5000` | таймаут одного whois-запроса (порт 43) |
| `PER_HOST_CONCURRENCY` | нет | `2` | максимум одновременных запросов на один RDAP/whois-хост |
| `PER_HOST_RPS` | нет | `1` | лимит запросов в секунду на один RDAP/whois-хост |
| `NODE_ENV` | нет | — | при `production` cookie `token` ставится с `secure: true` (если `COOKIE_SECURE` не задан явно). `Dockerfile` всегда ставит `NODE_ENV=production` в образе |
| `COOKIE_SECURE` | нет | `true`, если `NODE_ENV=production`, иначе `false` | явно включает/выключает флаг `secure` у cookie `token` (`"true"` / `"false"`) |
| `POSTGRES_PASSWORD` | только для `docker-compose.yml` (stage/prod) | — | пароль пользователя `domains` во встроенном Postgres-контейнере compose |

### Этап 2 — лента дропов

| Переменная | Обязательна | По умолчанию | Описание |
|---|---|---|---|
| `CZDS_USERNAME` / `CZDS_PASSWORD` | нет | — | креды ICANN CZDS; если обе не заданы, zone diff читает локальные файлы из `ZONE_FILES_DIR` вместо скачивания |
| `CZDS_ZONES` | нет | — | список TLD через запятую (`com,net,org`) для ежедневного zone diff (CZDS или `ZONE_FILES_DIR`) |
| `ZONE_FILES_DIR` | нет (нужна, если нет CZDS-кредов) | — | директория с локальными `<tld>.zone` / `<tld>.zone.gz` файлами (тестовые зоны на stage/dev) |
| `ZONE_DATA_DIR` | нет | `./data/zones` | директория для снимков доменов по TLD (`<tld>/<run_date>.sorted.txt`); должна быть на volume |
| `ZONE_KEEP_SNAPSHOTS` | нет | `2` | сколько последних снимков на TLD хранить (старые удаляются после diff) |
| `ZONE_DIFF_CRON` | нет | — | время ежедневного прогона zone diff, формат `"HH:MM"` (UTC); полный cron-синтаксис не поддерживается |
| `CSV_IMPORT_URLS` | нет | — | список URL через запятую для импорта CSV по расписанию |
| `CSV_IMPORT_CRON` | нет | — | время ежедневного импорта по `CSV_IMPORT_URLS`, формат `"HH:MM"` (UTC) |
| `UA_WATCH_CRON` | нет | — | время ежедневной перепроверки `ua_watchlist`, формат `"HH:MM"` (UTC) |

### Этап 3 — оценка домена

| Переменная | Обязательна | По умолчанию | Описание |
|---|---|---|---|
| `WAYBACK_MIN_INTERVAL_MS` | нет | `4000` | минимальный интервал (мс) между последовательными запросами к Wayback (CDX + снимки); очередь глобальная, не по доменам. `4000` ≈ 15 запросов/мин — выше archive.org практически блокирует IP; при 429/503 очередь дополнительно встаёт на cooldown (см. `docs/evaluation.md`) |
| `WAYBACK_SAMPLE` | нет | `4` | сколько снимков Wayback скачивать и анализировать на домен (по разным годам) |
| `WAYBACK_TIMEOUT_MS` | нет | `10000` | таймаут одного запроса к Wayback |
| `CC_MIN_INTERVAL_MS` | нет | `1000` | минимальный интервал (мс) между запросами к Common Crawl Index API (глобальная очередь) |
| `CC_TIMEOUT_MS` | нет | `10000` | таймаут одного запроса к Common Crawl |
| `EVAL_CACHE_TTL` | нет | `2592000` (30 дней) | TTL кэша (сек) результата оценки домена в `domain_evaluations` |
| `EVAL_DAILY_LIMIT` | нет | `50` | максимум свежих (не из кэша) автооценок новых дропов в сутки (UTC) |
| `EVAL_CRON` | нет | — | время ежедневного прогона фоновой автооценки дропов, формат `"HH:MM"` (UTC) |

Имена без значений — см. `.env.example` в корне репозитория.

**Важно:** т.к. образ всегда собирается с `NODE_ENV=production`, cookie `token`
по умолчанию выставляется с `Secure` — браузер не отправит/не сохранит такую
cookie без HTTPS. Если сервис в конкретном окружении отдаётся по голому HTTP
(например dev-прогон на Contabo без TLS-терминации), нужно явно выставить
`COOKIE_SECURE=false`, иначе вход через UI будет молча не работать. Для
prod/stage за HTTPS-терминацией (Dokploy/Traefik, Tailscale Serve) оставить
по умолчанию (`true`).
