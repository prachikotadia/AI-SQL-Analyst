import type { ChartSpec } from '@/types'

export function validateChartSpec(chartSpec: ChartSpec, columns: string[]): ChartSpec {
  // Handle nullable fields
  const xField = chartSpec.xField || null
  const yField = chartSpec.yField || null
  
  // Ensure xField and yField exist in columns (if not null)
  const validXField = xField && columns.includes(xField) ? xField : (columns[0] || null)
  const validYField = yField && columns.includes(yField) ? yField : (columns[1] || null)

  return {
    ...chartSpec,
    xField: validXField,
    yField: validYField,
    seriesField: chartSpec.seriesField && columns.includes(chartSpec.seriesField)
      ? chartSpec.seriesField
      : null,
  }
}

export function getDefaultChartSpec(columns: string[]): ChartSpec {
  return {
    type: 'table',
    xField: columns[0] || null,
    yField: columns[1] || null,
  }
}

