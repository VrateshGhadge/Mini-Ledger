import app from './app';
import { checkDatabaseConnection, closePool } from './config/db';
import { env } from './config/env';

async function start(): Promise<void> {
  await checkDatabaseConnection();
  console.log('Database connection verified.');

  const server = app.listen(env.PORT, () => {
    console.log(
      `MiniLedger API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
    );
  });

  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.log(`${signal} received, shutting down...`);

    server.close(async (error) => {
      if (error) {
        console.error('Error while closing the HTTP server:', error);
      }

      try {
        await closePool();
        console.log('Database pool closed.');
        process.exit(error ? 1 : 0);
      } catch (poolError) {
        console.error('Error while closing the database pool:', poolError);
        process.exit(1);
      }
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
