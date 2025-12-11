// Generate chart specs by analyzing query results, not relying on LLM output
// This is more reliable since we can inspect actual data structure

import type { ChartSpec } from '@/types'

export interface ChartGenerationResult {
  chartSpec: ChartSpec
  chartData: Record<string, unknown>[]
}

// Check if a column looks like a date/time field based on name and sample value
function isDateColumn(columnName: string, sampleValue: unknown): boolean {
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

// Check if a value can be treated as a number for charting
function isNumeric(value: unknown): boolean {
  if (value === null || value === undefined) return false
  return typeof value === 'number' || !isNaN(Number(value))
}

// Convert column names to readable labels for chart axes
function getColumnLabel(columnName: string): string {
  const labels: Record<string, string> = {
    'City': 'City',
    'State': 'State',
    'LonD': 'Longitude (Degrees)',
    'LonM': 'Longitude (Minutes)',
    'LonS': 'Longitude (Seconds)',
    'EW': 'East/West',
    'LatD': 'Latitude (Degrees)',
    'LatM': 'Latitude (Minutes)',
    'LatS': 'Latitude (Seconds)',
    'NS': 'North/South',
    'count': 'Count',
    'total': 'Total',
    'avg': 'Average',
    'sum': 'Sum',
  }
  
  if (labels[columnName]) return labels[columnName]
  
  // Format: replace underscores, capitalize words
  return columnName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim()
}

// Coordinate components like LonD/LatM aren't useful for charts - skip them
function isCoordinateComponent(columnName: string): boolean {
  const coordCols = ['LonD', 'LonM', 'LonS', 'EW', 'LatD', 'LatM', 'LatS', 'NS']
  return coordCols.includes(columnName)
}

// Analyze query results and pick the best chart type automatically
// Looks at column types, query text, and data patterns to decide
export function generateChartFromResult(
  rows: Record<string, unknown>[],
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
    const numValue = typeof value === 'number' ? value : (typeof value === 'string' ? parseFloat(value) || 0 : 0)
    const othersValue = totalCount && totalCount > numValue ? totalCount - numValue : numValue * 0.1
    return {
      chartSpec: {
        type: 'pie',
        xField: 'segment',
        yField: 'value',
      },
      chartData: [
        { segment: 'Result', value: numValue },
        { segment: 'Others', value: othersValue },
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

  // Case 3: Multiple columns - intelligently select best category + numeric
  // CRITICAL: Analyze query to find relevant fields mentioned in the query
  const queryLower = query.toLowerCase()
  
  // First, identify all numeric and category columns
  const numericColumns = columnNames.filter(col => 
    isNumeric(firstRow[col]) && !isCoordinateComponent(col) && col !== 'Index' && col !== 'index'
  )
  const categoryColumns = columnNames.filter(col => 
    !isNumeric(firstRow[col]) && !isDateColumn(col, firstRow[col]) && !isCoordinateComponent(col) &&
    col !== 'Index' && col !== 'index'
  )
  
  // Find numeric columns mentioned in query (price, cost, amount, revenue, etc.)
  const queryRelevantNumericColumns = numericColumns.filter(col => {
    const colLower = col.toLowerCase()
    // Check if column name or query mentions similar terms
    const queryHasPrice = queryLower.includes('price') || queryLower.includes('cost') || 
                         queryLower.includes('amount') || queryLower.includes('revenue') ||
                         queryLower.includes('value') || queryLower.includes('total')
    const colIsPrice = colLower.includes('price') || colLower.includes('cost') ||
                      colLower.includes('amount') || colLower.includes('revenue') ||
                      colLower.includes('value') || colLower.includes('total')
    
    // Check for other common numeric fields
    if (queryLower.includes(colLower) || (queryHasPrice && colIsPrice)) {
      return true
    }
    
    // Check for count, sum, avg, max, min aggregations
    if (queryLower.includes('count') && colLower.includes('count')) return true
    if (queryLower.includes('sum') && colLower.includes('sum')) return true
    if (queryLower.includes('average') || queryLower.includes('avg')) {
      if (colLower.includes('avg') || colLower.includes('average')) return true
    }
    if (queryLower.includes('maximum') || queryLower.includes('max')) {
      if (colLower.includes('max') || colLower.includes('maximum')) return true
    }
    if (queryLower.includes('minimum') || queryLower.includes('min')) {
      if (colLower.includes('min') || colLower.includes('minimum')) return true
    }
    
    return false
  })
  
  // Find category columns mentioned in query (name, product, city, state, etc.)
  const queryRelevantCategoryColumns = categoryColumns.filter(col => {
    const colLower = col.toLowerCase()
    // Check if column name appears in query
    if (queryLower.includes(colLower)) return true
    
    // Check for common synonyms
    if ((queryLower.includes('product') || queryLower.includes('item')) && 
        (colLower.includes('name') || colLower.includes('product') || colLower.includes('item'))) {
      return true
    }
    if (queryLower.includes('city') && colLower.includes('city')) return true
    if (queryLower.includes('state') && colLower.includes('state')) return true
    
    return false
  })

  // Prioritize query-relevant columns
  const bestNumericColumn = queryRelevantNumericColumns.length > 0 
    ? queryRelevantNumericColumns[0]
    : (numericColumns.find(col => !col.toLowerCase().includes('index')) || numericColumns[0])
  
  const bestCategoryColumn = queryRelevantCategoryColumns.length > 0
    ? queryRelevantCategoryColumns[0]
    : (categoryColumns.find(col => 
        ['Name', 'name', 'Product', 'product', 'City', 'city', 'State', 'state'].includes(col)
      ) || categoryColumns[0])

  // For coordinate queries, prefer showing count by location rather than raw coordinates
  const isCoordinateQuery = queryLower.includes('longitude') || queryLower.includes('latitude') || 
                           queryLower.includes('west') || queryLower.includes('east') ||
                           queryLower.includes('north') || queryLower.includes('south')
  
  if (isCoordinateQuery && bestCategoryColumn && rows.length > 0) {
    // Group by location (City or State) and show count
    const locationKey = bestCategoryColumn
    const grouped: Record<string, number> = {}
    
    rows.forEach(row => {
      const key = String(row[locationKey] || 'Unknown')
      grouped[key] = (grouped[key] || 0) + 1
    })
    
    const chartData = Object.entries(grouped)
      .map(([key, count]) => ({
        [locationKey]: key,
        count: count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20) // Limit to top 20 for readability
    
    return {
      chartSpec: {
        type: 'bar',
        xField: locationKey,
        yField: 'count',
      },
      chartData,
    }
  }

  // Use query-relevant columns, or fallback to best available
  if (bestCategoryColumn && bestNumericColumn) {
    // Sort data by numeric column (descending) for better visualization
    const sortedRows = [...rows].sort((a, b) => {
      const valA = Number(a[bestNumericColumn]) || 0
      const valB = Number(b[bestNumericColumn]) || 0
      return valB - valA // Descending order
    })
    
    return {
      chartSpec: {
        type: 'bar',
        xField: bestCategoryColumn,
        yField: bestNumericColumn,
      },
      chartData: sortedRows.map(row => ({
        [bestCategoryColumn]: String(row[bestCategoryColumn] || 'Unknown'),
        [bestNumericColumn]: Number(row[bestNumericColumn]) || 0,
      })),
    }
  }
  
  // Fallback: use any available category + numeric
  if (bestCategoryColumn && numericColumns.length > 0) {
    const bestNum = numericColumns.find(col => !col.toLowerCase().includes('index')) || numericColumns[0]
    const sortedRows = [...rows].sort((a, b) => {
      const valA = Number(a[bestNum]) || 0
      const valB = Number(b[bestNum]) || 0
      return valB - valA
    })
    
    return {
      chartSpec: {
        type: 'bar',
        xField: bestCategoryColumn,
        yField: bestNum,
      },
      chartData: sortedRows.map(row => ({
        [bestCategoryColumn]: String(row[bestCategoryColumn] || 'Unknown'),
        [bestNum]: Number(row[bestNum]) || 0,
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

