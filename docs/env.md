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
| `POSTGRES_PASSWORD` | только для `docker-compose.yml` (stage/prod) | — | пароль пользователя `domains` во встроенном Postgres-контейнере compose |

Имена без значений — см. `.env.example` в корне репозитория.
