// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
import 'dotenv/config';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The local dashboard launcher cannot run in production. Use npm start for an authenticated deployment.');
}

process.env.NODE_ENV = 'development';
process.env.XACTIONS_LOCAL_DASHBOARD = '1';
process.env.XACTIONS_NO_TELEMETRY = '1';

const { start } = await import('../api/server.js');
start();
