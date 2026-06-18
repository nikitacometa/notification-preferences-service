create table if not exists notification_defaults (
  notification_type text not null,
  channel           text not null,
  enabled           boolean not null,
  primary key (notification_type, channel)
);

create table if not exists user_preferences (
  user_id           text not null,
  notification_type text not null,
  channel           text not null,
  enabled           boolean not null,
  updated_at        timestamptz not null default now(),
  primary key (user_id, notification_type, channel)
);

create table if not exists user_quiet_hours (
  user_id    text primary key,
  start_time text not null, -- "22:00"
  end_time   text not null, -- "08:00"
  tz         text not null  -- IANA, "Europe/Moscow"
);

-- NULL в поле = wildcard
create table if not exists global_policies (
  id                bigserial primary key,
  notification_type text,
  channel           text,
  region            text
);

-- Разумные дефолты: транзакционные включены, маркетинг выключен.
insert into notification_defaults (notification_type, channel, enabled) values
  ('transactional_email', 'email', true),
  ('marketing_email',     'email', false),
  ('marketing_push',      'push',  false),
  ('marketing_sms',       'sms',   false)
on conflict do nothing;
