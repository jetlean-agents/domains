## Деплой

### Архитектура

Stage и prod используют одинаковую архитектуру: `docker-compose.yml` в
репозитории поднимает приложение (`app`) и собственный Postgres (`db`) с
volume — общий dev-Postgres Contabo (`platform-postgres-1`) в stage/prod ENV
не попадает, он используется только для разработки (см. ниже).

- **Prod:** `domains.jetlean.com`, доступен только через Tailscale.
- **Stage:** `domains.bigear.uk` (Dokploy sandbox) — деплой и DNS/hostname —
  задача DevOps.

```bash
cp .env.example .env   # заполнить POSTGRES_PASSWORD, ADMIN_TOKEN, DATABASE_URL не нужен — compose строит его сам
docker compose up -d --build
```

Миграции (`src/db/migrations/*.sql`) применяются автоматически при старте
контейнера `app`.

### Dev (Contabo, общий Postgres)

Для разработки — отдельный Postgres-контейнер под проект запрещён правилами
раннтайма Contabo. Используется общая БД:

```bash
docker exec platform-postgres-1 psql -U dev -c "CREATE DATABASE domains;"
# DATABASE_URL=postgres://dev:dev@100.94.103.26:5432/domains
```

Порт сервиса — только из диапазона 6000–6999, только на
`100.94.103.26` (пример: `100.94.103.26:6001:3000`), никогда `0.0.0.0`.
После проверки dev-стек нужно остановить (`docker compose down`).

### Первый вход (bootstrap)

1. Задать `ADMIN_TOKEN` в ENV перед первым запуском.
2. Войти в UI (`/login`) этим токеном.
3. Создать именованные service-токены: `npm run token:create -- --name autoreg`.
