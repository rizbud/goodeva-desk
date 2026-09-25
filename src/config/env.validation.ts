import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  LLM_API_BASE_URL: z
    .string()
    .default('https://generativelanguage.googleapis.com/v1beta/openai'),
  LLM_API_KEY: z.string().min(1, 'LLM_API_KEY is required'),
  LLM_MODEL_ID: z.string().default('gemini-2.5-flash-lite'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `\nEnvironment validation failed:\n${formattedErrors}\n`,
    );
  }

  return result.data;
}
