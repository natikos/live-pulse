export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  kafkaBrokers: string[];
  rabbitmqUrl: string | undefined;
  otelEndpoint: string | undefined;
}

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parsePort(raw: string | undefined): number {
  const port = Number(raw || 3000);

  if (!Number.isInteger(port)) {
    throw new Error(`Invalid PORT: ${raw}`);
  }

  return port;
}

export function loadConfig(): AppConfig {
  const env = process.env;
  return {
    port: parsePort(env.PORT),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    kafkaBrokers: required('KAFKA_BROKERS')
      .split(',')
      .map((broker) => broker.trim())
      .filter((broker) => broker.length > 0),
    rabbitmqUrl: env.RABBITMQ_URL || undefined,
    otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
  };
}

export const config = loadConfig();
