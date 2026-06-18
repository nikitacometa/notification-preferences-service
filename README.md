# Notification Preferences Service

Сервис управления предпочтениями уведомлений: единый источник правды о том, можно ли отправить пользователю уведомление данного типа по данному каналу прямо сейчас. Учитывает дефолты, выбор пользователя, глобальные политики и тихие часы.

## Стек

TypeScript, Node 20+, Express, PostgreSQL (через `pg`). Тесты на Vitest.

## Запуск

```bash
cp .env.example .env        # при необходимости поправьте DATABASE_URL
docker compose up -d db     # или свой Postgres
pnpm install
pnpm start                  # схема применяется автоматически при старте
```

Сервис поднимется на `http://localhost:3000`.

## Тесты

```bash
pnpm test
```

Юнит-тесты движка решений идут без БД. Интеграционный тест идемпотентности запускается, только если задан `DATABASE_URL`:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/notifications pnpm test
```

## API

| Метод | Путь | Назначение |
|-------|------|-----------|
| GET | `/users/:id/preferences` | текущие настройки пользователя |
| POST | `/users/:id/preferences` | изменить настройки и/или тихие часы |
| POST | `/evaluate` | можно ли отправить уведомление сейчас |

```bash
curl -XPOST localhost:3000/evaluate -H 'content-type: application/json' -d '{
  "userId": "user-1", "notificationType": "marketing_email",
  "channel": "email", "region": "EU", "datetime": "2026-05-21T12:00:00Z"
}'
# -> {"decision":"deny","reason":"default_off"}   # маркетинг по умолчанию выключен
```

## Что добавил бы для продакшена

- bulk-`evaluate` и кэш дефолтов с политиками: сейчас на каждый запрос пара лёгких SELECT'ов;
- аудит-лог изменений и метрики (счётчики решений по причинам);
- админ-API для управления политиками и дефолтами.
