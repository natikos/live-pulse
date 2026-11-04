import createClient from 'openapi-fetch';
import type { paths } from '@/api/schema';

const baseUrl = import.meta.env.VITE_API_BASE_URL;
if (!baseUrl) {
  throw new Error(
    'Missing VITE_API_BASE_URL: copy .env.example to .env in web/',
  );
}

export const client = createClient<paths>({ baseUrl });
