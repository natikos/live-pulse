import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { config } from './config.js';
import { createOpenAPIDocument } from './openapi.js';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const openAPIFactory = () => createOpenAPIDocument(app);
  SwaggerModule.setup('api', app, openAPIFactory);

  await app.listen(config.port);
}

await bootstrap();
