'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { ColumnMetadata } from '@/types'

interface DataInsightsPanelProps {
  data: Record<string, any>[]
  columns: ColumnMetadata[]
}

interface ColumnStats {
  name: string
  type: string
  nullCount: number
  nullPercentage: number
  uniqueCount: number
  numericStats?: {
    min: number
    max: number
    mean: number
    median: number
    sum: number
    stdDev: number
  }
  quality: 'excellent' | 'good' | 'fair' | 'poor'
}

export function DataInsightsPanel({ data, columns }: DataInsightsPanelProps) {
  const stats = useMemo(() => {
    if (!data || data.length === 0 || !columns || columns.length === 0) {
      return []
    }

    return columns.map(col => {
      const values = data.map(row => row[col.name]).filter(v => v !== null && v !== undefined)
      const nullCount = data.length - values.length
      const nullPercentage = (nullCount / data.length) * 100
      const uniqueValues = new Set(values.map(v => String(v)))
      const uniqueCount = uniqueValues.size

      let numericStats: ColumnStats['numericStats'] | undefined
      let quality: ColumnStats['quality'] = 'excellent'

      // Calculate numeric statistics if applicable
      if (col.type === 'integer' || col.type === 'decimal' || col.type === 'numeric') {
        const numericValues = values
          .map(v => {
            const num = Number(v)
            return isNaN(num) ? null : num
          })
          .filter((v): v is number => v !== null)

        if (numericValues.length > 0) {
          const sorted = [...numericValues].sort((a, b) => a - b)
          const sum = numericValues.reduce((acc, val) => acc + val, 0)
          const mean = sum / numericValues.length
          const median = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)]
          
          const variance = numericValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / numericValues.length
          const stdDev = Math.sqrt(variance)

          numericStats = {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            mean,
            median,
            sum,
            stdDev,
          }
        }
      }

      // Determine data quality
      if (nullPercentage > 50) {
        quality = 'poor'
      } else if (nullPercentage > 25) {
        quality = 'fair'
      } else if (nullPercentage > 10) {
        quality = 'good'
      } else {
        quality = 'excellent'
      }

      return {
        name: col.name,
        type: col.type,
        nullCount,
        nullPercentage,
        uniqueCount,
        numericStats,
        quality,
      } as ColumnStats
    })
  }, [data, columns])

  const overallQuality = useMemo(() => {
    if (stats.length === 0) return 'excellent'
    const avgNullPercentage = stats.reduce((sum, s) => sum + s.nullPercentage, 0) / stats.length
    if (avgNullPercentage > 50) return 'poor'
    if (avgNullPercentage > 25) return 'fair'
    if (avgNullPercentage > 10) return 'good'
    return 'excellent'
  }, [stats])

  if (!data || data.length === 0) {
    return (
      <Card className="neumorphic-card">
        <CardHeader>
          <CardTitle>Data Insights</CardTitle>
          <CardDescription>No data available for analysis</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const qualityColors = {
    excellent: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    good: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    fair: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
    poor: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  }

  const qualityIcons = {
    excellent: CheckCircle2,
    good: CheckCircle2,
    fair: AlertCircle,
    poor: AlertCircle,
  }

  return (
    <Card className="neumorphic-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Data Insights</CardTitle>
            <CardDescription>
              {data.length} rows • {columns.length} columns
            </CardDescription>
          </div>
          <Badge className={qualityColors[overallQuality]}>
            {overallQuality.charAt(0).toUpperCase() + overallQuality.slice(1)} Quality
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-sm text-muted-foreground">Total Rows</div>
            <div className="text-2xl font-bold">{data.length.toLocaleString()}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-sm text-muted-foreground">Total Columns</div>
            <div className="text-2xl font-bold">{columns.length}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-sm text-muted-foreground">Complete Rows</div>
            <div className="text-2xl font-bold">
              {data.filter(row => columns.every(col => row[col.name] != null)).length.toLocaleString()}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-sm text-muted-foreground">Avg Null %</div>
            <div className="text-2xl font-bold">
              {stats.length > 0
                ? (stats.reduce((sum, s) => sum + s.nullPercentage, 0) / stats.length).toFixed(1)
                : 0}%
            </div>
          </div>
        </div>

        {/* Column Statistics */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Column Statistics</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {stats.map((stat) => {
              const QualityIcon = qualityIcons[stat.quality]
              return (
                <div
                  key={stat.name}
                  className="p-3 rounded-lg border bg-card space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{stat.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {stat.type}
                      </Badge>
                      <Badge className={`${qualityColors[stat.quality]} text-xs`}>
                        <QualityIcon className="h-3 w-3 mr-1" />
                        {stat.quality}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Nulls: </span>
                      <span className="font-medium">
                        {stat.nullCount} ({stat.nullPercentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Unique: </span>
                      <span className="font-medium">{stat.uniqueCount}</span>
                    </div>
                    {stat.numericStats && (
                      <>
                        <div>
                          <span className="text-muted-foreground">Min: </span>
                          <span className="font-medium">{stat.numericStats.min.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Max: </span>
                          <span className="font-medium">{stat.numericStats.max.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Mean: </span>
                          <span className="font-medium">{stat.numericStats.mean.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Median: </span>
                          <span className="font-medium">{stat.numericStats.median.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sum: </span>
                          <span className="font-medium">{stat.numericStats.sum.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Std Dev: </span>
                          <span className="font-medium">{stat.numericStats.stdDev.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
