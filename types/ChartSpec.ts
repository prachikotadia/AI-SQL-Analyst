import { z } from 'zod'

export const ChartSpecSchema = z.object({
  type: z.enum(['bar', 'line', 'area', 'pie', 'table', 'kpi', 'single_value']).nullable(),
  xField: z.string().nullable(),
  yField: z.string().nullable(),
  seriesField: z.string().nullable().optional(),
  aggregation: z.enum(['sum', 'avg', 'count', 'max', 'min', 'none']).nullable().optional(),
})

export type ChartSpec = z.infer<typeof ChartSpecSchema>

export type ChartType = ChartSpec['type']

