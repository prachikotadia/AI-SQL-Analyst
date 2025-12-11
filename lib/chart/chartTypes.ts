import type { ChartSpec } from '@/types'

export type ChartType = ChartSpec['type']

export const CHART_TYPES = {
  BAR: 'bar' as const,
  LINE: 'line' as const,
  AREA: 'area' as const,
  PIE: 'pie' as const,
  SCATTER: 'scatter' as const,
  HEATMAP: 'heatmap' as const,
  TABLE: 'table' as const,
  KPI: 'kpi' as const,
  SINGLE_VALUE: 'single_value' as const,
} as const

export const AGGREGATION_TYPES = {
  SUM: 'sum' as const,
  AVG: 'avg' as const,
  COUNT: 'count' as const,
  MAX: 'max' as const,
  MIN: 'min' as const,
} as const

export interface ChartTypeConfig {
  type: ChartType
  label: string
  description: string
  suitableFor: string[]
  defaultFields: {
    xField: string
    yField: string
    seriesField?: string
  }
}

export const CHART_TYPE_CONFIGS: Record<NonNullable<ChartType>, ChartTypeConfig> = {
  bar: {
    type: 'bar',
    label: 'Bar Chart',
    description: 'Best for categorical comparisons',
    suitableFor: ['categorical_breakdown', 'comparison'],
    defaultFields: {
      xField: 'category',
      yField: 'value',
    },
  },
  line: {
    type: 'line',
    label: 'Line Chart',
    description: 'Best for time series data',
    suitableFor: ['time_series'],
    defaultFields: {
      xField: 'date',
      yField: 'value',
    },
  },
  area: {
    type: 'area',
    label: 'Area Chart',
    description: 'Best for cumulative time series',
    suitableFor: ['time_series'],
    defaultFields: {
      xField: 'date',
      yField: 'value',
    },
  },
  pie: {
    type: 'pie',
    label: 'Pie Chart',
    description: 'Best for proportional breakdowns',
    suitableFor: ['categorical_breakdown'],
    defaultFields: {
      xField: 'category',
      yField: 'value',
    },
  },
  table: {
    type: 'table',
    label: 'Table',
    description: 'Best for detailed reports',
    suitableFor: ['table_report', 'single_value'],
    defaultFields: {
      xField: 'column1',
      yField: 'column2',
    },
  },
  kpi: {
    type: 'kpi',
    label: 'KPI Card',
    description: 'Best for single metrics',
    suitableFor: ['single_value'],
    defaultFields: {
      xField: 'label',
      yField: 'value',
    },
  },
  single_value: {
    type: 'single_value',
    label: 'Single Value',
    description: 'Best for single metrics',
    suitableFor: ['single_value'],
    defaultFields: {
      xField: 'label',
      yField: 'value',
    },
  },
  scatter: {
    type: 'scatter',
    label: 'Scatter Plot',
    description: 'Best for correlations and relationships',
    suitableFor: ['correlation', 'comparison'],
    defaultFields: {
      xField: 'x',
      yField: 'y',
    },
  },
  heatmap: {
    type: 'heatmap',
    label: 'Heatmap',
    description: 'Best for patterns and density',
    suitableFor: ['pattern', 'density'],
    defaultFields: {
      xField: 'x',
      yField: 'y',
    },
  },
}

export function getChartTypeConfig(type: ChartType): ChartTypeConfig | undefined {
  if (!type) return undefined
  return CHART_TYPE_CONFIGS[type]
}

export function isChartTypeSuitableFor(chartType: ChartType, queryCategory: string): boolean {
  if (!chartType) return false
  const config = CHART_TYPE_CONFIGS[chartType]
  return config?.suitableFor.includes(queryCategory) || false
}

