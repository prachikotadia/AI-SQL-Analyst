'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { renderChart } from '@/lib/chart/renderChart'
import type { ChartSpec, ColumnMetadata } from '@/types'

interface ChartPanelProps {
  data: Record<string, any>[]
  chartSpec: ChartSpec
  columns: ColumnMetadata[]
}

export function ChartPanel({ data, chartSpec, columns }: ChartPanelProps) {
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
    <div className="space-y-6">
      <Tabs defaultValue="bar" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="bar">Bar Chart</TabsTrigger>
          <TabsTrigger value="pie">Pie Chart</TabsTrigger>
          <TabsTrigger value="line">Line Chart</TabsTrigger>
        </TabsList>
        
        <TabsContent value="bar" className="mt-4 animate-in fade-in-50 duration-300">
          <Card>
            <CardHeader>
              <CardTitle>Bar Chart</CardTitle>
            </CardHeader>
            <CardContent className="transition-opacity duration-300">
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

        <TabsContent value="pie" className="mt-4 animate-in fade-in-50 duration-300">
          <Card>
            <CardHeader>
              <CardTitle>Pie Chart</CardTitle>
            </CardHeader>
            <CardContent className="transition-opacity duration-300">
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

        <TabsContent value="line" className="mt-4 animate-in fade-in-50 duration-300">
          <Card>
            <CardHeader>
              <CardTitle>Line Chart</CardTitle>
            </CardHeader>
            <CardContent className="transition-opacity duration-300">
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
    </div>
  )
}

