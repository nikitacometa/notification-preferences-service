import { pool } from './pool.js';
import { Channel, EvaluateContext, GlobalPolicy, QuietHours } from '../domain/engine.js';

export interface PreferenceRow {
  notificationType: string;
  channel: Channel;
  enabled: boolean;
}

export async function getUserPreferences(userId: string): Promise<PreferenceRow[]> {
  const { rows } = await pool.query(
    `select notification_type, channel, enabled
       from user_preferences
      where user_id = $1
      order by notification_type, channel`,
    [userId],
  );
  return rows.map((r) => ({ notificationType: r.notification_type, channel: r.channel, enabled: r.enabled }));
}

export async function setPreference(
  userId: string,
  notificationType: string,
  channel: Channel,
  enabled: boolean,
): Promise<void> {
  await pool.query(
    `insert into user_preferences (user_id, notification_type, channel, enabled, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (user_id, notification_type, channel)
     do update set enabled = excluded.enabled, updated_at = now()`,
    [userId, notificationType, channel, enabled],
  );
}

export async function setQuietHours(userId: string, q: QuietHours): Promise<void> {
  await pool.query(
    `insert into user_quiet_hours (user_id, start_time, end_time, tz)
     values ($1, $2, $3, $4)
     on conflict (user_id)
     do update set start_time = excluded.start_time, end_time = excluded.end_time, tz = excluded.tz`,
    [userId, q.start, q.end, q.tz],
  );
}

export async function loadContext(
  userId: string,
  notificationType: string,
  channel: Channel,
): Promise<EvaluateContext> {
  const [pref, def, quiet, policies] = await Promise.all([
    pool.query(
      `select enabled from user_preferences where user_id = $1 and notification_type = $2 and channel = $3`,
      [userId, notificationType, channel],
    ),
    pool.query(`select enabled from notification_defaults where notification_type = $1 and channel = $2`, [
      notificationType,
      channel,
    ]),
    pool.query(`select start_time, end_time, tz from user_quiet_hours where user_id = $1`, [userId]),
    pool.query(`select notification_type, channel, region from global_policies`),
  ]);

  const quietRow = quiet.rows[0];
  return {
    preference: pref.rows[0]?.enabled,
    defaultEnabled: def.rows[0]?.enabled ?? false,
    quietHours: quietRow
      ? { start: quietRow.start_time, end: quietRow.end_time, tz: quietRow.tz }
      : undefined,
    policies: policies.rows.map(
      (p): GlobalPolicy => ({
        notificationType: p.notification_type ?? undefined,
        channel: p.channel ?? undefined,
        region: p.region ?? undefined,
      }),
    ),
  };
}
