import { createHash } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { reset } from 'drizzle-seed'
import { Pool } from 'pg'
import { env } from '../lib/env'
import * as schema from './schema'
import { artPromptTemplateSeeds } from './seeds/art-prompt-templates'

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
})

export const db = drizzle(pool, { schema })
let artPromptTemplateSeedPromise: Promise<number> | null = null

const createSeedId = (provider: string, templateKey: string) => {
  return createHash('sha256')
    .update(`${provider}:${templateKey}`)
    .digest('hex')
    .slice(0, 24)
}

export const seedArtPromptTemplates = async (options?: { resetFirst?: boolean }) => {
  if (options?.resetFirst) {
    await reset(
      db as unknown as Parameters<typeof reset>[0],
      { artPromptTemplates: schema.artPromptTemplates } as unknown as Parameters<typeof reset>[1],
    )
  }

  for (const seed of artPromptTemplateSeeds) {
    const id = createSeedId(seed.provider, seed.templateKey)
    await db.insert(schema.artPromptTemplates).values({
      id,
      provider: seed.provider,
      templateKey: seed.templateKey,
      promptTemplate: seed.promptTemplate,
      referenceImageUrl: seed.referenceImageUrl,
      notes: seed.notes || '',
      isActive: seed.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [
        schema.artPromptTemplates.provider,
        schema.artPromptTemplates.templateKey,
      ],
      set: {
        promptTemplate: seed.promptTemplate,
        referenceImageUrl: seed.referenceImageUrl,
        notes: seed.notes || '',
        isActive: seed.isActive,
        updatedAt: new Date(),
      },
    })
  }

  return artPromptTemplateSeeds.length
}

export const ensureArtPromptTemplatesSeeded = () => {
  artPromptTemplateSeedPromise ??= seedArtPromptTemplates()
  return artPromptTemplateSeedPromise
}
