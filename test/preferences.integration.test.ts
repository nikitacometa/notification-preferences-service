import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { migrate, pool } from '../src/db/pool.js';
import { getUserPreferences, setPreference } from '../src/db/repo.js';

// нужен живой Postgres
describe.skipIf(!process.env.DATABASE_URL)('идемпотентность настроек', () => {
  beforeAll(async () => {
    await migrate();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('двойное выключение даёт одно состояние и одну строку', async () => {
    const userId = `test-${Date.now()}`;
    await setPreference(userId, 'marketing_email', 'email', false);
    await setPreference(userId, 'marketing_email', 'email', false);

    expect(await getUserPreferences(userId)).toEqual([
      { notificationType: 'marketing_email', channel: 'email', enabled: false },
    ]);
  });
});
