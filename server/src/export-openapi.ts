import { promises as fs } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createOpenAPIDocument } from './openapi.js';

// Run through `npm run openapi:export` (it builds first). Writes openapi.json,
// the contract that web/ generates its types from. Commit it with the API change.
const app = await NestFactory.create(AppModule, { logger: false });
await app.init();
const document = createOpenAPIDocument(app);
await app.close();

await fs.writeFile('openapi.json', `${JSON.stringify(document, null, 2)}\n`);
