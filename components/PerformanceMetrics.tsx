'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, Zap, Code, TrendingUp } from 'lucide-react'

interface PerformanceMetricsProps {
  executionTimeMs?: number
  tokenUsage?: number
  queryComplexity?: number
  sqlLength?: number
}

export function PerformanceMetrics({
  executionTimeMs,
  tokenUsage,
  queryComplexity,
  sqlLength,
}: PerformanceMetricsProps) {
  if (!executionTimeMs && !tokenUsage && !queryComplexity && !sqlLength) {
    return null
  }

  const getComplexityLabel = (complexity?: number) => {
    if (!complexity) return 'N/A'
    if (complexity < 3) return 'Simple'
    if (complexity < 6) return 'Moderate'
    if (complexity < 10) return 'Complex'
    return 'Very Complex'
  }

  const getComplexityColor = (complexity?: number) => {
    if (!complexity) return 'text-muted-foreground'
    if (complexity < 3) return 'text-green-600 dark:text-green-400'
    if (complexity < 6) return 'text-blue-600 dark:text-blue-400'
    if (complexity < 10) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <Card className="neumorphic-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Performance Metrics
        </CardTitle>
        <CardDescription>Query execution statistics</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {executionTimeMs !== undefined && (
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                Execution Time
              </div>
              <div className="text-2xl font-bold">
                {executionTimeMs < 1000
                  ? `${executionTimeMs.toFixed(0)}ms`
                  : `${(executionTimeMs / 1000).toFixed(2)}s`}
              </div>
            </div>
          )}

          {tokenUsage !== undefined && (
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                Tokens Used
              </div>
              <div className="text-2xl font-bold">{tokenUsage.toLocaleString()}</div>
            </div>
          )}

          {queryComplexity !== undefined && (
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Code className="h-4 w-4" />
                Complexity
              </div>
              <div className={`text-2xl font-bold ${getComplexityColor(queryComplexity)}`}>
                {getComplexityLabel(queryComplexity)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Score: {queryComplexity}/10
              </div>
            </div>
          )}

          {sqlLength !== undefined && (
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Code className="h-4 w-4" />
                SQL Length
              </div>
              <div className="text-2xl font-bold">{sqlLength} chars</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
