import { fileURLToPath } from 'node:url';
import { createAppServer } from '../server.js';

// Deliberately ignore the pilot data-file, Blob, and PORT environment variables.
export function createLocalWeekServer() {
  return createAppServer({
    experiment: true,
    dataFile: fileURLToPath(new URL('../data/temple-week-experiment.json', import.meta.url)),
    blobToken: null
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.TEMPLE_WEEK_PORT) || 3001;
  const server = createLocalWeekServer();
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set TEMPLE_WEEK_PORT to another port.` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Temple Week local experiment: http://localhost:${port}`);
    console.log('Separate local data; Blob access disabled.');
    if (!process.env.TEMPLE_CARPOOL_ADMIN_PIN) console.log('Local demo admin PIN: 2468');
  });
}
