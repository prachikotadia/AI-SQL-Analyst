import { z } from 'zod'

export const ErrorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.enum(['validation', 'execution', 'llm', 'unknown', 'no_files', 'out_of_scope']),
    code: z.string().optional(),
  }),
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

export const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  database: z.boolean(),
  llm: z.boolean(),
  timestamp: z.string(),
})

export type HealthResponse = z.infer<typeof HealthResponseSchema>

