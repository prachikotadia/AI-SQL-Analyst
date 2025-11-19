export type QueryType = 
  | 'time_series'
  | 'categorical_breakdown'
  | 'single_value'
  | 'table_report'
  | 'comparison'
  | 'unknown'

export interface QueryClassification {
  type: QueryType
  confidence: number
}

const TIME_KEYWORDS = ['last', 'days', 'months', 'weeks', 'year', 'date', 'time', 'trend', 'over time', 'daily', 'monthly', 'weekly', 'hourly']
const CATEGORICAL_KEYWORDS = ['by', 'group', 'category', 'region', 'breakdown', 'each', 'per', 'grouped by']
const SINGLE_VALUE_KEYWORDS = ['total', 'sum', 'average', 'avg', 'mean', 'count', 'how many', 'what is', 'show me']
const COMPARISON_KEYWORDS = ['compare', 'versus', 'vs', 'difference', 'between', 'versus', 'compared to']
const TABLE_REPORT_KEYWORDS = ['show table', 'list', 'display all', 'show all', 'table', 'report', 'details']

export function classifyQuery(query: string): QueryClassification {
  const lowerQuery = query.toLowerCase()
  
  let timeScore = 0
  let categoricalScore = 0
  let singleValueScore = 0
  let comparisonScore = 0
  let tableReportScore = 0

  for (const keyword of TIME_KEYWORDS) {
    if (lowerQuery.includes(keyword)) timeScore++
  }

  for (const keyword of CATEGORICAL_KEYWORDS) {
    if (lowerQuery.includes(keyword)) categoricalScore++
  }

  for (const keyword of SINGLE_VALUE_KEYWORDS) {
    if (lowerQuery.includes(keyword)) singleValueScore++
  }

  for (const keyword of COMPARISON_KEYWORDS) {
    if (lowerQuery.includes(keyword)) comparisonScore++
  }

  for (const keyword of TABLE_REPORT_KEYWORDS) {
    if (lowerQuery.includes(keyword)) tableReportScore++
  }

  // Determine primary type
  const scores = [
    { type: 'time_series' as QueryType, score: timeScore },
    { type: 'categorical_breakdown' as QueryType, score: categoricalScore },
    { type: 'single_value' as QueryType, score: singleValueScore },
    { type: 'comparison' as QueryType, score: comparisonScore },
    { type: 'table_report' as QueryType, score: tableReportScore },
  ]

  scores.sort((a, b) => b.score - a.score)
  const maxScore = scores[0].score

  if (maxScore === 0) {
    return { type: 'unknown', confidence: 0.5 }
  }

  return {
    type: scores[0].type,
    confidence: Math.min(maxScore / 5, 1.0), // Normalize to 0-1
  }
}

export function suggestChartType(classification: QueryClassification, chartSpec?: { type: string }): string {
  // If chart spec already has a type, use it
  if (chartSpec?.type && chartSpec.type !== 'table') {
    return chartSpec.type
  }

  switch (classification.type) {
    case 'time_series':
      return 'line'
    case 'categorical_breakdown':
      return 'bar'
    case 'single_value':
      return 'table' // Single values are better as tables or KPI cards
    case 'comparison':
      return 'bar'
    default:
      return 'table'
  }
}

