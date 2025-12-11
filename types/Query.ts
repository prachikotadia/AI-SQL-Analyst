import { z } from 'zod'

export const QueryRequestSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  timeRange: z.enum(['last_7_days', 'last_30_days', 'last_90_days', 'all_time']).optional(),
  fileIds: z.array(z.string()).optional().default([]),
  chatId: z.string().optional(),
})

export type QueryRequest = z.infer<typeof QueryRequestSchema>

export const QueryResponseSchema = z.object({
  data: z.array(z.record(z.any())),
  columns: z.array(z.object({
    name: z.string(),
    type: z.string(),
  })),
  reasoning: z.string(),
  preview_sql: z.string().nullable(),
  action_sql: z.string().nullable(),
  sql: z.string().optional(), // Legacy field
  chartSpec: z.object({
    type: z.enum(['bar', 'line', 'area', 'pie', 'scatter', 'heatmap', 'table', 'kpi', 'single_value']).nullable(),
    xField: z.string().nullable(),
    yField: z.string().nullable(),
    seriesField: z.string().nullable().optional(),
    aggregation: z.enum(['sum', 'avg', 'count', 'max', 'min', 'none']).nullable().optional(),
  }),
  metricsInfo: z.object({
    name: z.string(),
    displayName: z.string(),
    description: z.string(),
  }).optional(),
  queryCategory: z.string().optional(),
  performanceMetrics: z.object({
    executionTimeMs: z.number(),
    tokenUsage: z.number().optional(),
    queryComplexity: z.number().optional(),
    sqlLength: z.number().optional(),
  }).optional(),
  error: z.object({
    message: z.string(),
    type: z.enum(['validation', 'execution', 'llm', 'unknown', 'no_files', 'out_of_scope']),
  }).nullable(),
})

export type QueryResponse = z.infer<typeof QueryResponseSchema>

