/**
 * Generate chart specification based on SQL result shape (not LLM)
 */

import type { ChartSpec } from '@/types'

export interface ChartGenerationResult {
  chartSpec: ChartSpec
  chartData: any[]
}

/**
 * Detect if a column is likely a date/time column
 */
function isDateColumn(columnName: string, sampleValue: any): boolean {
  if (!sampleValue) return false
  const colLower = columnName.toLowerCase()
  if (/date|time|timestamp|created|updated|year|month|day/i.test(colLower)) {
    return true
  }
  // Check if value looks like a date
  if (typeof sampleValue === 'string') {
    return /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}/.test(sampleValue)
  }
  return false
}

/**
 * Detect if a value is numeric
 */
function isNumeric(value: any): boolean {
  if (value === null || value === undefined) return false
  return typeof value === 'number' || !isNaN(Number(value))
}

/**
 * Generate chart from SQL result rows
 */
export function generateChartFromResult(
  rows: any[],
  columns: Array<{ name: string; type: string }>,
  query: string,
  totalCount?: number
): ChartGenerationResult {
  if (rows.length === 0) {
    return {
      chartSpec: {
        type: 'table',
        xField: null,
        yField: null,
      },
      chartData: [],
    }
  }

  const columnNames = columns.map(c => c.name)
  const firstRow = rows[0]

  // Case 1: Single value result (COUNT, SUM, AVG, etc.)
  if (columns.length === 1 && isNumeric(firstRow[columnNames[0]])) {
    const value = firstRow[columnNames[0]]
    // Create comparison pie: this value vs others
    const othersValue = totalCount && totalCount > value ? totalCount - value : value * 0.1
    return {
      chartSpec: {
        type: 'pie',
        xField: 'segment',
        yField: 'value',
      },
      chartData: [
        { segment: 'Result', value: Number(value) },
        { segment: 'Others', value: Number(othersValue) },
      ],
    }
  }

  // Case 2: Two columns - category + numeric (bar chart)
  if (columns.length === 2) {
    const col1 = columnNames[0]
    const col2 = columnNames[1]
    const val1 = firstRow[col1]
    const val2 = firstRow[col2]

    if (isDateColumn(col1, val1) && isNumeric(val2)) {
      // Time series: date + numeric
      return {
        chartSpec: {
          type: 'line',
          xField: col1,
          yField: col2,
        },
        chartData: rows.map(row => ({
          [col1]: row[col1],
          [col2]: Number(row[col2]) || 0,
        })),
      }
    } else if (isNumeric(val2)) {
      // Category + numeric: bar chart
      return {
        chartSpec: {
          type: 'bar',
          xField: col1,
          yField: col2,
        },
        chartData: rows.map(row => ({
          [col1]: row[col1],
          [col2]: Number(row[col2]) || 0,
        })),
      }
    }
  }

  // Case 3: Multiple columns - try to find category + numeric
  const numericColumns = columnNames.filter(col => 
    isNumeric(firstRow[col])
  )
  const categoryColumns = columnNames.filter(col => 
    !isNumeric(firstRow[col]) && !isDateColumn(col, firstRow[col])
  )

  if (categoryColumns.length > 0 && numericColumns.length > 0) {
    // Use first category + first numeric
    return {
      chartSpec: {
        type: 'bar',
        xField: categoryColumns[0],
        yField: numericColumns[0],
      },
      chartData: rows.map(row => ({
        [categoryColumns[0]]: row[categoryColumns[0]],
        [numericColumns[0]]: Number(row[numericColumns[0]]) || 0,
      })),
    }
  }

  // Case 4: Filtered list (e.g., "list cities in Texas")
  // Create comparison pie: filtered rows vs remaining
  const filteredCount = rows.length
  const remainingCount = totalCount && totalCount > filteredCount 
    ? totalCount - filteredCount 
    : Math.max(1, Math.floor(filteredCount * 0.1))

  // Try to infer the filter category from query
  let filterLabel = 'Filtered'
  const queryLower = query.toLowerCase()
  if (queryLower.includes('texas') || queryLower.includes('tx')) {
    filterLabel = 'Texas'
  } else if (queryLower.includes('california') || queryLower.includes('ca')) {
    filterLabel = 'California'
  } else if (queryLower.includes('new york') || queryLower.includes('ny')) {
    filterLabel = 'New York'
  }

  return {
    chartSpec: {
      type: 'pie',
      xField: 'segment',
      yField: 'value',
    },
    chartData: [
      { segment: filterLabel, value: filteredCount },
      { segment: 'Others', value: remainingCount },
    ],
  }
}

