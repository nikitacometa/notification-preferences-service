export type Channel = 'email' | 'sms' | 'push' | 'messenger';
export type Category = 'transactional' | 'marketing';

export interface QuietHours {
  start: string; // "22:00"
  end: string; // "08:00"
  tz: string; // IANA
}

export interface GlobalPolicy {
  notificationType?: string;
  channel?: Channel;
  region?: string; // пустое поле = wildcard
}

export type Reason = 'allowed' | 'blocked_by_global_policy' | 'user_disabled' | 'default_off' | 'quiet_hours';

export interface Decision {
  decision: 'allow' | 'deny';
  reason: Reason;
}

export interface EvaluateInput {
  userId: string;
  notificationType: string;
  channel: Channel;
  region: string;
  at: Date; // UTC
}

export interface EvaluateContext {
  preference: boolean | undefined; // явная настройка пользователя; undefined → берётся дефолт
  defaultEnabled: boolean;
  quietHours?: QuietHours;
  policies: GlobalPolicy[];
}

// Всё, что не транзакционное, считаем маркетингом — только оно подчиняется тихим часам.
export function categoryOf(notificationType: string): Category {
  return notificationType.startsWith('transactional') ? 'transactional' : 'marketing';
}

function localMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === 'hour')!.value);
  const minute = Number(parts.find((p) => p.type === 'minute')!.value);
  return hour * 60 + minute;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

export function inQuietHours(at: Date, q: QuietHours): boolean {
  const now = localMinutes(at, q.tz);
  const start = toMinutes(q.start);
  const end = toMinutes(q.end);
  // окно может переходить через полночь (22:00–08:00)
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

function policyMatches(p: GlobalPolicy, i: EvaluateInput): boolean {
  return (
    (p.notificationType === undefined || p.notificationType === i.notificationType) &&
    (p.channel === undefined || p.channel === i.channel) &&
    (p.region === undefined || p.region === i.region)
  );
}

// Приоритет: глобальная политика → выбор пользователя → тихие часы → разрешено.
export function evaluate(input: EvaluateInput, ctx: EvaluateContext): Decision {
  if (ctx.policies.some((p) => policyMatches(p, input))) {
    return { decision: 'deny', reason: 'blocked_by_global_policy' };
  }

  const enabled = ctx.preference ?? ctx.defaultEnabled;
  if (!enabled) {
    return { decision: 'deny', reason: ctx.preference === false ? 'user_disabled' : 'default_off' };
  }

  if (
    categoryOf(input.notificationType) === 'marketing' &&
    ctx.quietHours &&
    inQuietHours(input.at, ctx.quietHours)
  ) {
    return { decision: 'deny', reason: 'quiet_hours' };
  }

  return { decision: 'allow', reason: 'allowed' };
}
