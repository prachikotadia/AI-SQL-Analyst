import { z } from 'zod'

export const MetricDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  sqlExpression: z.string(),
  defaultGrain: z.array(z.string()),
  defaultTimeRange: z.enum(['last_7_days', 'last_30_days', 'last_90_days', 'all_time']),
  exampleQueries: z.array(z.string()),
})

export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>

export const MetricInfoSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
})

export type MetricInfo = z.infer<typeof MetricInfoSchema>

