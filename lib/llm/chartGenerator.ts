import { classifyQuery } from '../ml/classifier'
import type { ChartSpec } from '@/types'

/**
 * Generate chart specification based on query classification and data
 */
export function generateChartSpec(
  query: string,
  columns: string[],
  llmChartSpec?: ChartSpec
): ChartSpec {
  const classification = classifyQuery(query)

  // If LLM provided a valid chart spec, use it (with validation)
  if (llmChartSpec && llmChartSpec.type && llmChartSpec.xField && llmChartSpec.yField) {
    // Validate fields exist in columns
    const validXField = columns.includes(llmChartSpec.xField) 
      ? llmChartSpec.xField 
      : columns[0] || 'x'
    const validYField = columns.includes(llmChartSpec.yField)
      ? llmChartSpec.yField
      : columns[1] || 'y'

    return {
      ...llmChartSpec,
      xField: validXField,
      yField: validYField,
    }
  }

  // Auto-generate based on classification
  let chartType: ChartSpec['type'] = 'table'
  let xField = columns[0] || 'x'
  let yField = columns[1] || 'y'

  switch (classification.type) {
    case 'time_series':
      chartType = 'line'
      // Find date/timestamp column
      const dateCol = columns.find(col => 
        /date|time|timestamp|created|updated/i.test(col)
      )
      if (dateCol) xField = dateCol
      break

    case 'categorical_breakdown':
      chartType = 'bar'
      break

    case 'single_value':
      chartType = 'kpi'
      break

    case 'comparison':
      chartType = 'bar'
      break

    default:
      chartType = 'table'
  }

  return {
    type: chartType,
    xField,
    yField,
  }
}

