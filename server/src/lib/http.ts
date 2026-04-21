import type { Context } from 'hono'
import type { z } from 'zod'
import { badRequest } from './errors'

export const parseJsonBody = async <T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> => {
  const json = await c.req.json().catch(() => null)
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw badRequest('Invalid request body', parsed.error.flatten())
  }
  return parsed.data
}

export const parseQuery = <T extends z.ZodTypeAny>(c: Context, schema: T): z.infer<T> => {
  const parsed = schema.safeParse(c.req.query())
  if (!parsed.success) {
    throw badRequest('Invalid query string', parsed.error.flatten())
  }
  return parsed.data
}

export const parseParams = <T extends z.ZodTypeAny>(c: Context, schema: T): z.infer<T> => {
  const parsed = schema.safeParse(c.req.param())
  if (!parsed.success) {
    throw badRequest('Invalid route params', parsed.error.flatten())
  }
  return parsed.data
}
