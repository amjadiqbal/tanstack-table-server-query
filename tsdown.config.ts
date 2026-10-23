import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    drizzle: 'src/drizzle.ts',
    prisma: 'src/prisma.ts',
    kysely: 'src/kysely.ts',
    supabase: 'src/supabase.ts',
  },
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  clean: true,
  external: ['drizzle-orm', 'kysely'],
})
