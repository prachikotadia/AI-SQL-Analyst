/**
 * Query suggestions and templates
 */

export interface QueryTemplate {
  id: string
  label: string
  query: string
  description: string
  category: 'analysis' | 'aggregation' | 'filtering' | 'comparison' | 'trends'
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    id: 'top-n',
    label: 'Top N Items',
    query: 'Show me the top 10 items by',
    description: 'Get the top N items sorted by a column',
    category: 'analysis',
  },
  {
    id: 'summary',
    label: 'Summary Statistics',
    query: 'Show me summary statistics for',
    description: 'Get count, sum, average, min, max',
    category: 'aggregation',
  },
  {
    id: 'filter',
    label: 'Filter Data',
    query: 'Show all records where',
    description: 'Filter data by specific conditions',
    category: 'filtering',
  },
  {
    id: 'compare',
    label: 'Compare Categories',
    query: 'Compare',
    description: 'Compare values across different categories',
    category: 'comparison',
  },
  {
    id: 'trend',
    label: 'Trend Analysis',
    query: 'Show trends over time for',
    description: 'Analyze trends and patterns',
    category: 'trends',
  },
  {
    id: 'group',
    label: 'Group By',
    query: 'Group by',
    description: 'Group and aggregate data',
    category: 'aggregation',
  },
  {
    id: 'average',
    label: 'Calculate Average',
    query: 'What is the average',
    description: 'Calculate average values',
    category: 'aggregation',
  },
  {
    id: 'count',
    label: 'Count Records',
    query: 'How many',
    description: 'Count total records',
    category: 'aggregation',
  },
]

export function getRecentQueries(): string[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem('ai_sql_analyst_recent_queries')
    if (!stored) return []
    const queries: string[] = JSON.parse(stored)
    return queries.slice(0, 10) // Return last 10 queries
  } catch {
    return []
  }
}

export function saveRecentQuery(query: string) {
  if (typeof window === 'undefined') return
  
  try {
    const recent = getRecentQueries()
    // Remove duplicate if exists
    const filtered = recent.filter(q => q.toLowerCase() !== query.toLowerCase())
    // Add to beginning
    const updated = [query, ...filtered].slice(0, 10) // Keep only 10
    localStorage.setItem('ai_sql_analyst_recent_queries', JSON.stringify(updated))
  } catch {
    // Ignore errors
  }
}

export function getSuggestions(input: string, templates: QueryTemplate[] = QUERY_TEMPLATES): string[] {
  if (!input || input.trim().length === 0) {
    // Return templates and recent queries when input is empty
    const recent = getRecentQueries()
    return [
      ...templates.slice(0, 5).map(t => t.query),
      ...recent.slice(0, 5),
    ]
  }

  const lowerInput = input.toLowerCase()
  const suggestions: string[] = []

  // Match templates
  for (const template of templates) {
    if (template.query.toLowerCase().includes(lowerInput) || 
        template.label.toLowerCase().includes(lowerInput)) {
      suggestions.push(template.query)
    }
  }

  // Match recent queries
  const recent = getRecentQueries()
  for (const query of recent) {
    if (query.toLowerCase().includes(lowerInput) && !suggestions.includes(query)) {
      suggestions.push(query)
    }
  }

  return suggestions.slice(0, 8) // Limit to 8 suggestions
}

export function calculateQueryComplexity(sql: string): number {
  if (!sql) return 0

  let complexity = 1 // Base complexity

  // Count keywords that increase complexity
  const complexKeywords = [
    'join', 'union', 'group by', 'order by', 'having',
    'case when', 'subquery', 'cte', 'window', 'partition',
    'distinct', 'count', 'sum', 'avg', 'max', 'min',
  ]

  const lowerSql = sql.toLowerCase()
  for (const keyword of complexKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
    const matches = lowerSql.match(regex)
    if (matches) {
      complexity += matches.length
    }
  }

  // Add complexity based on length
  if (sql.length > 200) complexity += 1
  if (sql.length > 500) complexity += 1
  if (sql.length > 1000) complexity += 2

  // Cap at 10
  return Math.min(complexity, 10)
}
