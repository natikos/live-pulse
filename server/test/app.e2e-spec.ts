import request from 'supertest';
import { useTestApp } from './helpers/app.js';
import { HttpStatus } from '@nestjs/common';

describe('AppController (e2e)', () => {
  const getApp = useTestApp();

  it('/ (GET)', () => {
    return request(getApp().getHttpServer())
      .get('/')
      .expect(HttpStatus.OK)
      .expect({ status: 'ok' });
  });
});
