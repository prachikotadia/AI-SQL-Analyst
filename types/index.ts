// Re-export all types from modular files
export * from './Query'
export * from './ChartSpec'
export * from './Metric'
export * from './ApiResponse'

// Additional types
export interface ColumnMetadata {
  name: string
  type: string
}

export interface LLMResponse {
  preview_sql: string | null
  action_sql: string | null
  reasoning: string
  chart: import('./ChartSpec').ChartSpec
  // Legacy fields for backward compatibility
  sql?: string
  metric_name?: string
  query_category?: string
}

export interface QueryEvaluation {
  query: string
  sql: string
  success: boolean
  errorType?: string
  latencyMs: number
  rowCount: number
  tokensUsed?: number
  timestamp: Date
}

export interface QueryHistoryItem {
  id: string
  query: string
  timestamp: Date
  summary: string
  success: boolean
}

export interface ChatInfo {
  chatId: string
  title: string
  updatedAt: Date
  messageCount: number
  fileCount?: number
}

