import 'dotenv/config';

process.env.NODE_ENV = 'production';

const { start } = await import('../api/server.js');
start();
