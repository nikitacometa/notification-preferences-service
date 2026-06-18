import { describe, it, expect } from 'vitest';
import { evaluate, inQuietHours } from '../src/domain/engine.js';
import type { EvaluateContext, EvaluateInput } from '../src/domain/engine.js';

const input = (over: Partial<EvaluateInput> = {}): EvaluateInput => ({
  userId: 'user-1',
  notificationType: 'marketing_email',
  channel: 'email',
  region: 'EU',
  at: new Date('2026-05-21T12:00:00Z'),
  ...over,
});

const ctx = (over: Partial<EvaluateContext> = {}): EvaluateContext => ({
  preference: undefined,
  defaultEnabled: true,
  policies: [],
  ...over,
});

describe('evaluate', () => {
  it('новый пользователь: дефолт решает (включён → allow, выключен → default_off)', () => {
    expect(evaluate(input(), ctx({ defaultEnabled: true }))).toEqual({
      decision: 'allow',
      reason: 'allowed',
    });
    expect(evaluate(input(), ctx({ defaultEnabled: false }))).toEqual({
      decision: 'deny',
      reason: 'default_off',
    });
  });

  it('пользователь выключил marketing_email; транзакционные остаются разрешены', () => {
    expect(evaluate(input(), ctx({ preference: false }))).toEqual({
      decision: 'deny',
      reason: 'user_disabled',
    });
    expect(evaluate(input({ notificationType: 'transactional_email' }), ctx())).toEqual({
      decision: 'allow',
      reason: 'allowed',
    });
  });

  it('тихие часы блокируют маркетинг, но не транзакционные', () => {
    const quietHours = { start: '22:00', end: '08:00', tz: 'Europe/Moscow' };
    const at = new Date('2026-05-21T20:30:00Z'); // 23:30 МСК — внутри окна
    expect(
      evaluate(input({ notificationType: 'marketing_push', channel: 'push', at }), ctx({ quietHours })),
    ).toEqual({
      decision: 'deny',
      reason: 'quiet_hours',
    });
    expect(evaluate(input({ notificationType: 'transactional_email', at }), ctx({ quietHours }))).toEqual({
      decision: 'allow',
      reason: 'allowed',
    });
  });

  it('глобальная политика запрещает marketing_sms в EU (и только в EU)', () => {
    const policies = [{ notificationType: 'marketing_sms', channel: 'sms' as const, region: 'EU' }];
    expect(evaluate(input({ notificationType: 'marketing_sms', channel: 'sms' }), ctx({ policies }))).toEqual(
      {
        decision: 'deny',
        reason: 'blocked_by_global_policy',
      },
    );
    expect(
      evaluate(input({ notificationType: 'marketing_sms', channel: 'sms', region: 'US' }), ctx({ policies })),
    ).toEqual({ decision: 'allow', reason: 'allowed' });
  });

  it('приоритет: глобальная политика сильнее выбора пользователя', () => {
    expect(evaluate(input(), ctx({ preference: false, policies: [{ region: 'EU' }] }))).toEqual({
      decision: 'deny',
      reason: 'blocked_by_global_policy',
    });
  });
});

describe('inQuietHours — переход через полночь', () => {
  const q = { start: '22:00', end: '08:00', tz: 'Europe/Moscow' };
  it.each([
    ['2026-05-21T20:00:00Z', true], // 23:00 МСК
    ['2026-05-21T04:00:00Z', true], // 07:00 МСК
    ['2026-05-21T05:30:00Z', false], // 08:30 МСК — окно уже закрылось
    ['2026-05-21T09:00:00Z', false], // 12:00 МСК
  ])('%s → %s', (iso, expected) => {
    expect(inQuietHours(new Date(iso), q)).toBe(expected);
  });
});
