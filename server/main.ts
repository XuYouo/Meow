import 'dotenv/config';
import { createServer } from 'node:http';
import { createWorkspaceApplication } from './bootstrap.js';
import { readConfig } from './system/config.js';

const config = readConfig();
const application = createWorkspaceApplication({ config });
const server = createServer(application.app);
server.requestTimeout = 60_000;
server.headersTimeout = 15_000;
server.listen(config.port, config.host, () => {
  process.stdout.write(`Meow ready at http://${config.host}:${config.port}\n`);
});
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    application.close();
    process.exitCode = 1;
  }, 10_000);
  deadline.unref();
  server.close(() => {
    clearTimeout(deadline);
    application.close();
    process.exitCode = 0;
  });
  server.closeIdleConnections();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
server.once('error', (error) => {
  process.stderr.write(`Server startup failed (${error.name}).\n`);
  application.close();
  process.exitCode = 1;
});
