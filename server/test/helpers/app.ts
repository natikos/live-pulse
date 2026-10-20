import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';

async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  await app.init();

  return app;
}

// Registers beforeAll/afterAll, so call it first in the file or `describe`.
// The app exists only after beforeAll: call the getter inside tests and hooks,
// not while the tests are being collected.
export function useTestApp(): () => INestApplication<App> {
  let app: INestApplication<App> | undefined;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
    app = undefined;
  });

  return () => {
    if (!app) {
      throw new Error(
        'Test app is not ready: call getApp() inside a test or hook',
      );
    }
    return app;
  };
}
