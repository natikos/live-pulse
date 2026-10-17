import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { config } from './config.js';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const openAPIConfig = new DocumentBuilder()
    .setTitle('Live Pulse API')
    .setDescription(
      'Live Pulse is a real-time event dashboard API. It ingests events, serves stored events and aggregated metrics, and streams live updates to connected clients.',
    )
    .setVersion('0.0.1')
    .build();
  const openAPIFactory = () => SwaggerModule.createDocument(app, openAPIConfig);
  SwaggerModule.setup('api', app, openAPIFactory);

  await app.listen(config.port);
}

await bootstrap();
