import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const openAPIConfig = new DocumentBuilder()
  .setTitle('Live Pulse API')
  .setDescription(
    'Live Pulse is a real-time event dashboard API. It ingests events, serves stored events and aggregated metrics, and streams live updates to connected clients.',
  )
  .setVersion('0.0.1')
  .build();

// Shared by the running server and scripts/export-openapi.ts, so the committed
// openapi.json is the same document that /api-json serves.
export function createOpenAPIDocument(app: INestApplication) {
  return SwaggerModule.createDocument(app, openAPIConfig);
}
