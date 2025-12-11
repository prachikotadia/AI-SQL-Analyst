'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MetricInfo } from '@/types'

interface ReasoningPanelProps {
  reasoning: string
  metricsInfo?: MetricInfo
}

export function ReasoningPanel({ reasoning, metricsInfo }: ReasoningPanelProps) {
  return (
    <Card className="neumorphic-card">
      <CardHeader className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
          <CardTitle className="text-base sm:text-lg">AI Reasoning</CardTitle>
          {metricsInfo && (
            <span className="text-[10px] sm:text-xs px-2 py-1 bg-primary/10 text-primary rounded-md border border-primary/20">
              Metric: {metricsInfo.displayName}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-6">
        <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-foreground break-words">{reasoning}</p>
        {metricsInfo && (
          <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-muted/50 rounded-lg border border-border/50">
            <p className="text-[10px] sm:text-xs font-semibold mb-1">{metricsInfo.displayName}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">{metricsInfo.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

