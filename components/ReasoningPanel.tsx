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
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">AI Reasoning</CardTitle>
          {metricsInfo && (
            <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-md border border-primary/20">
              Metric: {metricsInfo.displayName}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{reasoning}</p>
        {metricsInfo && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border/50">
            <p className="text-xs font-semibold mb-1">{metricsInfo.displayName}</p>
            <p className="text-xs text-muted-foreground">{metricsInfo.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

