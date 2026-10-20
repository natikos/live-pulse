import 'dotenv/config';

export interface AppConfig {
  nodeEnv: string | undefined;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  kafkaBrokers: string[];
  rabbitmqUrl: string | undefined;
  otelEndpoint: string | undefined;
  maxClockSkewMs: number;
  maxEventAgeMs: number;
}

const DEFAULT_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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

function parseDurationMs(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const ms = Number(raw);

  if (!Number.isInteger(ms) || ms < 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }

  return ms;
}

export function loadConfig(): AppConfig {
  const env = process.env;
  return {
    nodeEnv: env.NODE_ENV,
    port: parsePort(env.PORT),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    kafkaBrokers: required('KAFKA_BROKERS')
      .split(',')
      .map((broker) => broker.trim())
      .filter((broker) => broker.length > 0),
    rabbitmqUrl: env.RABBITMQ_URL || undefined,
    otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
    maxClockSkewMs: parseDurationMs(
      'MAX_CLOCK_SKEW_MS',
      env.MAX_CLOCK_SKEW_MS,
      DEFAULT_MAX_CLOCK_SKEW_MS,
    ),
    maxEventAgeMs: parseDurationMs(
      'MAX_EVENT_AGE_MS',
      env.MAX_EVENT_AGE_MS,
      DEFAULT_MAX_EVENT_AGE_MS,
    ),
  };
}

export const config = loadConfig();
