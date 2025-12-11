'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Maximize2 } from 'lucide-react'
import { renderChart } from '@/lib/chart/renderChart'
import { ChartFullscreenModal } from './ChartFullscreenModal'
import type { ChartSpec, ColumnMetadata } from '@/types'

interface ChartPanelProps {
  data: Record<string, any>[]
  chartSpec: ChartSpec
  columns: ColumnMetadata[]
  query?: string // Optional query text for generating meaningful titles
}

export function ChartPanel({ data, chartSpec, columns, query }: ChartPanelProps) {
  const [fullscreenChart, setFullscreenChart] = useState<{
    type: 'bar' | 'pie' | 'line'
  } | null>(null)
  
  // Generate meaningful chart title from fields and query
  const generateChartTitle = (type: string, xField: string | null, yField: string | null): string => {
    if (!xField || !yField) {
      return `${type.charAt(0).toUpperCase() + type.slice(1)} Chart`
    }
    
    // Format field names for display
    const formatFieldName = (field: string): string => {
      return field
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim()
    }
    
    const xLabel = formatFieldName(xField)
    const yLabel = formatFieldName(yField)
    
    // Generate descriptive title based on chart type
    switch (type) {
      case 'bar':
        return `${yLabel} by ${xLabel}`
      case 'line':
        return `${yLabel} Over Time`
      case 'pie':
        return `Distribution of ${xLabel}`
      default:
        return `${yLabel} vs ${xLabel}`
    }
  }
  
  // Generate chart description/subtitle
  const generateChartDescription = (xField: string | null, yField: string | null, dataLength: number): string => {
    if (!xField || !yField) {
      return `Showing ${dataLength} ${dataLength === 1 ? 'result' : 'results'}`
    }
    
    const formatFieldName = (field: string): string => {
      return field
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim()
    }
    
    const xLabel = formatFieldName(xField)
    const yLabel = formatFieldName(yField)
    
    return `Showing ${yLabel} for each ${xLabel} (${dataLength} ${dataLength === 1 ? 'item' : 'items'})`
  }
  if (data.length === 0) {
    return (
      <Card className="neumorphic-card">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-medium text-lg mb-1">No chart available</p>
              <p className="text-sm text-muted-foreground">
                No chart available for this query. View the Data tab instead.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Skip charts for table-only views or KPI/single_value
  if (chartSpec.type === 'table' || chartSpec.type === 'kpi' || chartSpec.type === 'single_value') {
    const chartResult = renderChart({ data, chartSpec, columns })
    if (chartSpec.type === 'table') {
      return (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Table view selected. View data in the Data tab.</p>
            </div>
          </CardContent>
        </Card>
      )
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Key Performance Indicator</CardTitle>
        </CardHeader>
        <CardContent>
          {chartResult.component}
        </CardContent>
      </Card>
    )
  }

  // Smart field detection - find the best xField and yField from actual data
  const detectBestFields = () => {
    // Get actual data keys from first row
    const dataKeys = data.length > 0 ? Object.keys(data[0]) : []
    
    // If chartSpec has fields, try to match them to actual data keys
    if (chartSpec.xField && chartSpec.yField) {
      // Find best matches in actual data
      const matchedXField = dataKeys.find(key => 
        key.toLowerCase() === chartSpec.xField?.toLowerCase() ||
        key.toLowerCase().includes(chartSpec.xField?.toLowerCase() || '') ||
        (chartSpec.xField?.toLowerCase() || '').includes(key.toLowerCase())
      ) || chartSpec.xField
      
      const matchedYField = dataKeys.find(key => 
        key.toLowerCase() === chartSpec.yField?.toLowerCase() ||
        key.toLowerCase().includes(chartSpec.yField?.toLowerCase() || '') ||
        (chartSpec.yField?.toLowerCase() || '').includes(key.toLowerCase())
      ) || chartSpec.yField
      
      return {
        xField: matchedXField,
        yField: matchedYField,
        seriesField: chartSpec.seriesField || null,
      }
    }

    // Fallback: detect from actual data structure
    if (dataKeys.length === 0) {
      return { xField: '', yField: '', seriesField: null }
    }

    // Find date/timestamp column for xField (check actual data values)
    const dateColumn = dataKeys.find(key => {
      if (data.length === 0) return false
      const sample = data[0][key]
      return (
        /date|time|timestamp|created|updated|year|month|day/i.test(key) ||
        (typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sample)) ||
        sample instanceof Date
      )
    })

    // Find numeric column for yField (check actual data values)
    const numericColumns = dataKeys.filter(key => {
      if (data.length === 0) return false
      const sample = data[0][key]
      return typeof sample === 'number'
    })

    // Find text/categorical column for xField (if no date)
    const textColumns = dataKeys.filter(key => {
      if (data.length === 0) return false
      const sample = data[0][key]
      return typeof sample === 'string' && !dateColumn
    })

    let xField = dateColumn || textColumns[0] || dataKeys[0] || ''
    let yField = numericColumns[0] || numericColumns[1] || dataKeys[1] || dataKeys[0] || ''

    // If xField is the same as yField, find a different one
    if (xField === yField && dataKeys.length > 1) {
      xField = dataKeys.find(key => key !== yField) || dataKeys[0] || ''
    }

    // Find potential series field (third column that's categorical)
    const seriesField = textColumns.find(key => key !== xField) || null

    return { xField, yField, seriesField }
  }

  const { xField, yField, seriesField } = detectBestFields()

  // Create chart specs for bar, pie, and line
  const barChartSpec: ChartSpec = {
    type: 'bar',
    xField: xField,
    yField: yField,
    seriesField: seriesField || undefined,
    aggregation: chartSpec.aggregation || 'none',
  }

  const pieChartSpec: ChartSpec = {
    type: 'pie',
    xField: xField,
    yField: yField,
    aggregation: chartSpec.aggregation || 'none',
  }

  const lineChartSpec: ChartSpec = {
    type: 'line',
    xField: xField,
    yField: yField,
    seriesField: seriesField || undefined,
    aggregation: chartSpec.aggregation || 'none',
  }

  // Render all three chart types
  const barResult = renderChart({ data, chartSpec: barChartSpec, columns })
  const pieResult = renderChart({ data, chartSpec: pieChartSpec, columns })
  const lineResult = renderChart({ data, chartSpec: lineChartSpec, columns })

  // Check if any chart has an error
  const hasError = barResult.error || pieResult.error || lineResult.error
  const hasValidChart = barResult.component || pieResult.component || lineResult.component

  if (hasError && !hasValidChart) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">
              {barResult.error || pieResult.error || lineResult.error || 'Unable to render charts'}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Tabs defaultValue="bar" className="w-full">
        <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
          <TabsList className="grid w-full grid-cols-3 min-w-max sm:min-w-0">
            <TabsTrigger value="bar" className="text-xs sm:text-sm min-h-[44px] px-2 sm:px-4">Bar</TabsTrigger>
            <TabsTrigger value="pie" className="text-xs sm:text-sm min-h-[44px] px-2 sm:px-4">Pie</TabsTrigger>
            <TabsTrigger value="line" className="text-xs sm:text-sm min-h-[44px] px-2 sm:px-4">Line</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="bar" className="mt-3 sm:mt-4 animate-in fade-in-50 duration-300">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                <div>
                  <CardTitle className="text-base sm:text-lg">
                    {generateChartTitle('bar', xField, yField)}
                  </CardTitle>
                  {xField && yField && (
                    <CardDescription className="text-xs sm:text-sm">
                      {generateChartDescription(xField, yField, data.length)}
                    </CardDescription>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFullscreenChart({ type: 'bar' })}
                  className="gap-2 min-h-[44px] text-xs sm:text-sm"
                >
                  <Maximize2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Fullscreen</span>
                  <span className="sm:hidden">Full</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent 
              className="p-3 sm:p-6 transition-opacity duration-300 cursor-pointer hover:opacity-90"
              onClick={() => setFullscreenChart({ type: 'bar' })}
            >
              {barResult.error ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">{barResult.error}</p>
                </div>
              ) : (
                barResult.component
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pie" className="mt-3 sm:mt-4 animate-in fade-in-50 duration-300">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                <div>
                  <CardTitle className="text-base sm:text-lg">
                    {generateChartTitle('pie', xField, yField)}
                  </CardTitle>
                  {xField && yField && (
                    <CardDescription className="text-xs sm:text-sm">
                      {generateChartDescription(xField, yField, data.length)}
                    </CardDescription>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFullscreenChart({ type: 'pie' })}
                  className="gap-2 min-h-[44px] text-xs sm:text-sm"
                >
                  <Maximize2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Fullscreen</span>
                  <span className="sm:hidden">Full</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent 
              className="p-3 sm:p-6 transition-opacity duration-300 cursor-pointer hover:opacity-90"
              onClick={() => setFullscreenChart({ type: 'pie' })}
            >
              {pieResult.error ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">{pieResult.error}</p>
                </div>
              ) : (
                pieResult.component
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="line" className="mt-3 sm:mt-4 animate-in fade-in-50 duration-300">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                <div>
                  <CardTitle className="text-base sm:text-lg">
                    {generateChartTitle('line', xField, yField)}
                  </CardTitle>
                  {xField && yField && (
                    <CardDescription className="text-xs sm:text-sm">
                      {generateChartDescription(xField, yField, data.length)}
                    </CardDescription>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFullscreenChart({ type: 'line' })}
                  className="gap-2 min-h-[44px] text-xs sm:text-sm"
                >
                  <Maximize2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Fullscreen</span>
                  <span className="sm:hidden">Full</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent 
              className="p-3 sm:p-6 transition-opacity duration-300 cursor-pointer hover:opacity-90"
              onClick={() => setFullscreenChart({ type: 'line' })}
            >
              {lineResult.error ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">{lineResult.error}</p>
                </div>
              ) : (
                lineResult.component
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Fullscreen Modal */}
      {fullscreenChart && (
        <ChartFullscreenModal
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setFullscreenChart(null)
            }
          }}
          data={data}
          chartSpec={chartSpec}
          columns={columns}
          chartType={fullscreenChart.type}
          title={generateChartTitle(fullscreenChart.type, xField, yField)}
          description={xField && yField ? generateChartDescription(xField, yField, data.length) : undefined}
        />
      )}
    </div>
  )
}

