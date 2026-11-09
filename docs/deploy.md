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

`docker-compose.yml` не публикует порт `app` на хост (`expose: ["3000"]`, без
`ports:`) — наружу сервис не торчит сам по себе. Prod открывается только через
Tailscale (сеть/прокси на Tailscale-интерфейсе), stage — через Dokploy/Traefik
по внутренней docker-сети; оба обращаются к контейнеру `app` напрямую внутри
compose-сети, не через хостовый порт на `0.0.0.0`.

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

Образ собирается с `NODE_ENV=production` (см. `docs/env.md`), поэтому по
умолчанию cookie `token` — `Secure`. Dev-прогон на Contabo идёт по голому
HTTP (без TLS), так что в dev-ENV нужно явно `COOKIE_SECURE=false` — иначе
вход через UI не сохранит cookie в браузере.

### Первый вход (bootstrap)

1. Задать `ADMIN_TOKEN` в ENV перед первым запуском.
2. Войти в UI (`/login`) этим токеном.
3. Создать именованные service-токены на собранном образе (`token:create` /
   `token:revoke` / `token:list` запускают скомпилированный `dist/scripts/*.js`,
   `tsx` в рантайм-образе нет):

   ```bash
   docker compose exec app npm run token:create -- --name autoreg
   docker compose exec app npm run token:list
   docker compose exec app npm run token:revoke -- --name autoreg
   ```
