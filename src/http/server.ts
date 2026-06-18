import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { getUserPreferences, loadContext, setPreference, setQuietHours } from '../db/repo.js';
import { evaluate } from '../domain/engine.js';

export function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

const channel = z.enum(['email', 'sms', 'push', 'messenger']);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'ожидается время в формате HH:MM');

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
const timeZone = z.string().refine(isValidTimeZone, 'неизвестная таймзона');

const updateBody = z.object({
  preferences: z
    .array(z.object({ notificationType: z.string().min(1), channel, enabled: z.boolean() }))
    .optional(),
  quietHours: z.object({ start: hhmm, end: hhmm, tz: timeZone }).optional(),
});

const evaluateBody = z.object({
  userId: z.string().min(1),
  notificationType: z.string().min(1),
  channel,
  region: z.string().min(1),
  datetime: z.string().datetime(),
});

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/users/:id/preferences', async (req, res) => {
    res.json({ userId: req.params.id, preferences: await getUserPreferences(req.params.id) });
  });

  app.post('/users/:id/preferences', async (req, res) => {
    const userId = req.params.id;
    const body = updateBody.parse(req.body);

    await Promise.all(
      (body.preferences ?? []).map(async (p) => {
        await setPreference(userId, p.notificationType, p.channel, p.enabled);
        log('preference_changed', { userId, ...p });
      }),
    );
    if (body.quietHours) {
      await setQuietHours(userId, body.quietHours);
      log('quiet_hours_changed', { userId, ...body.quietHours });
    }
    res.json({ ok: true });
  });

  app.post('/evaluate', async (req, res) => {
    const input = evaluateBody.parse(req.body);
    const ctx = await loadContext(input.userId, input.notificationType, input.channel);
    const decision = evaluate({ ...input, at: new Date(input.datetime) }, ctx);
    log('evaluation', { ...input, ...decision });
    res.json(decision);
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'invalid_request', details: err.issues });
      return;
    }
    // битый JSON и прочие ошибки разбора тела — вина клиента, а не сбой сервиса
    const e = err as { status?: number; statusCode?: number };
    if (e.status === 400 || e.statusCode === 400) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    log('error', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'internal_error' });
  };
  app.use(onError);

  return app;
}
