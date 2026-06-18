import { migrate, pool } from './db/pool.js';
import { createApp, log } from './http/server.js';

const PORT = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  await migrate();
  const server = createApp().listen(PORT, () => log('started', { port: PORT }));

  const shutdown = (): void => {
    server.close(() => void pool.end().then(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log('fatal', { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
