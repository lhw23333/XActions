import 'dotenv/config';

process.env.NODE_ENV ??= 'development';

const { start } = await import('../api/server.js');
start();
