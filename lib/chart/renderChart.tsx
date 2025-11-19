import React from 'react'
import { BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { ChartSpec, ColumnMetadata } from '@/types'
import { CHART_TYPES } from './chartTypes'

// Enhanced color palette - more vibrant and accessible
const COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#6366f1', // Indigo
]

// Dark mode compatible colors
const COLORS_DARK = [
  '#60a5fa', // Light Blue
  '#34d399', // Light Green
  '#fbbf24', // Light Amber
  '#f87171', // Light Red
  '#a78bfa', // Light Purple
  '#22d3ee', // Light Cyan
  '#fb923c', // Light Orange
  '#f472b6', // Light Pink
  '#2dd4bf', // Light Teal
  '#818cf8', // Light Indigo
]

export interface RenderChartOptions {
  data: Record<string, any>[]
  chartSpec: ChartSpec
  columns: ColumnMetadata[]
  height?: number
}

export interface RenderChartResult {
  component: React.ReactElement | null
  error?: string
}

/**
 * Render chart component based on chart specification
 */
export function renderChart({ data, chartSpec, columns, height = 400 }: RenderChartOptions): RenderChartResult {
  if (data.length === 0) {
    return {
      component: null,
      error: 'No data to display',
    }
  }

  if (chartSpec.type === CHART_TYPES.TABLE || chartSpec.type === null) {
    return {
      component: null,
      error: 'Table view should be rendered separately',
    }
  }

  if (chartSpec.type === CHART_TYPES.KPI || chartSpec.type === CHART_TYPES.SINGLE_VALUE) {
    const yField = chartSpec.yField || columns[0]?.name || 'value'
    const value = data[0]?.[yField] ?? 'N/A'
    const label = chartSpec.xField || 'Value'
    
    return {
      component: (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-6xl font-bold text-primary mb-4">
            {typeof value === 'number' 
              ? new Intl.NumberFormat('en-US', { 
                  style: 'currency', 
                  currency: 'USD',
                  maximumFractionDigits: 0 
                }).format(value)
              : value}
          </div>
          <div className="text-lg text-muted-foreground">{label}</div>
        </div>
      ),
    }
  }

  // Get actual data keys from first row
  const dataKeys = data.length > 0 ? Object.keys(data[0]) : []
  
  // Smart field matching: find best match for xField and yField
  const findBestFieldMatch = (fieldName: string | null | undefined, preferredType?: 'numeric' | 'text' | 'date'): string | null => {
    if (!fieldName) return null
    
    // Exact match
    if (dataKeys.includes(fieldName)) {
      return fieldName
    }
    
    // Case-insensitive match
    const caseInsensitiveMatch = dataKeys.find(key => key.toLowerCase() === fieldName.toLowerCase())
    if (caseInsensitiveMatch) {
      return caseInsensitiveMatch
    }
    
    // Partial match (contains)
    const partialMatch = dataKeys.find(key => 
      key.toLowerCase().includes(fieldName.toLowerCase()) || 
      fieldName.toLowerCase().includes(key.toLowerCase())
    )
    if (partialMatch) {
      return partialMatch
    }
    
    // If preferred type, find by type
    if (preferredType && data.length > 0) {
      const sampleRow = data[0]
      if (preferredType === 'numeric') {
        const numericKey = dataKeys.find(key => typeof sampleRow[key] === 'number')
        if (numericKey) return numericKey
      } else if (preferredType === 'text') {
        const textKey = dataKeys.find(key => typeof sampleRow[key] === 'string')
        if (textKey) return textKey
      }
    }
    
    return null
  }
  
  // Find best matches for xField and yField
  let xField = findBestFieldMatch(chartSpec.xField, 'text')
  let yField = findBestFieldMatch(chartSpec.yField, 'numeric')
  
  // Fallback: if no match found, use first available columns
  if (!xField && dataKeys.length > 0) {
    // Prefer text/string columns for xField
    const textKey = dataKeys.find(key => {
      if (data.length === 0) return false
      const sample = data[0][key]
      return typeof sample === 'string' || typeof sample === 'object'
    })
    xField = textKey || dataKeys[0]
  }
  
  if (!yField && dataKeys.length > 1) {
    // Prefer numeric columns for yField
    const numericKey = dataKeys.find(key => {
      if (data.length === 0) return false
      const sample = data[0][key]
      return typeof sample === 'number'
    })
    yField = numericKey || dataKeys[1] || dataKeys[0]
  }
  
  // Ensure xField and yField are different
  if (xField === yField && dataKeys.length > 1) {
    yField = dataKeys.find(key => key !== xField) || yField
  }
  
  // For other chart types, both fields are required
  if (!xField || !yField) {
    return {
      component: null,
      error: `Missing required chart fields. Available columns: ${dataKeys.join(', ')}. Requested: xField=${chartSpec.xField}, yField=${chartSpec.yField}`,
    }
  }
  
  // Verify fields exist in data
  const hasXField = data.some(row => xField && xField in row)
  const hasYField = data.some(row => yField && yField in row)
  
  if (!hasXField || !hasYField) {
    return {
      component: null,
      error: `Fields not found in data. Available: ${dataKeys.join(', ')}. Looking for: xField=${xField}, yField=${yField}`,
    }
  }

  // Enhanced margins for better readability
  const commonProps = {
    data,
    margin: { top: 20, right: 30, left: 20, bottom: 60 },
  }

  // Format field names for display
  const formatFieldName = (fieldName: string): string => {
    return fieldName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim()
  }

  // Format numbers for Y-axis
  const formatYAxis = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
    return value.toString()
  }

  // Format tooltip values
  const formatTooltipValue = (value: any, name: string) => {
    if (typeof value === 'number') {
      if (name.toLowerCase().includes('amount') || name.toLowerCase().includes('revenue') || name.toLowerCase().includes('price') || name.toLowerCase().includes('cost')) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
      }
      if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`
      if (value >= 1000) return `${(value / 1000).toFixed(2)}K`
      return new Intl.NumberFormat('en-US').format(value)
    }
    return value
  }

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatTooltipValue(entry.value, entry.name)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  switch (chartSpec.type) {
    case CHART_TYPES.BAR:
      return {
        component: (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-muted-foreground">X-Axis:</span>
                  <p className="mt-1 font-medium">{formatFieldName(xField)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Categories or groups being compared</p>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground">Y-Axis:</span>
                  <p className="mt-1 font-medium">{formatFieldName(yField)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Measured values or quantities</p>
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={height}>
              <BarChart {...commonProps}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis 
                  dataKey={xField}
                  label={{ value: formatFieldName(xField), position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--foreground))', fontSize: 14, fontWeight: 600 } }}
                  angle={data.length > 10 ? -45 : 0}
                  textAnchor={data.length > 10 ? "end" : "middle"}
                  height={data.length > 10 ? 100 : 80}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  interval={data.length > 20 ? 'preserveStartEnd' : 0}
                />
                <YAxis 
                  label={{ value: formatFieldName(yField), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--foreground))', fontSize: 14, fontWeight: 600 } }}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={formatYAxis}
                />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="rect"
              />
              <Bar 
                dataKey={yField} 
                fill={COLORS[0]}
                radius={[8, 8, 0, 0]}
                name={yField.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        ),
      }

    case CHART_TYPES.LINE:
      const seriesField = chartSpec.seriesField
      const hasMultipleSeries = seriesField && data.some(row => row[seriesField])
      
      return {
        component: (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-muted-foreground">X-Axis:</span>
                  <p className="mt-1 font-medium">{formatFieldName(xField)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Time period or sequence</p>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground">Y-Axis:</span>
                  <p className="mt-1 font-medium">{formatFieldName(yField)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Measured values over time</p>
                </div>
                {hasMultipleSeries && seriesField && (
                  <div className="col-span-2">
                    <span className="font-semibold text-muted-foreground">Series:</span>
                    <p className="mt-1 font-medium">{formatFieldName(seriesField)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Different lines represent different categories</p>
                  </div>
                )}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={height}>
              <LineChart {...commonProps}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis 
                  dataKey={xField}
                  label={{ value: formatFieldName(xField), position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--foreground))', fontSize: 14, fontWeight: 600 } }}
                  angle={data.length > 10 ? -45 : 0}
                  textAnchor={data.length > 10 ? "end" : "middle"}
                  height={data.length > 10 ? 100 : 80}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  interval={data.length > 20 ? 'preserveStartEnd' : 0}
                />
                <YAxis 
                  label={{ value: formatFieldName(yField), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--foreground))', fontSize: 14, fontWeight: 600 } }}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={formatYAxis}
                />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
              />
              {hasMultipleSeries && seriesField ? (
                // Multiple series - render one line per series
                (() => {
                  const uniqueSeries = Array.from(new Set(data.map(row => row[seriesField]).filter(Boolean)))
                  return uniqueSeries.map((seriesValue, idx) => (
                    <Line
                      key={String(seriesValue)}
                      type="monotone"
                      dataKey={yField}
                      data={data.filter(row => row[seriesField] === seriesValue)}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: COLORS[idx % COLORS.length] }}
                      activeDot={{ r: 6 }}
                      name={String(seriesValue)}
                    />
                  ))
                })()
              ) : (
                <Line
                  type="monotone"
                  dataKey={yField}
                  stroke={COLORS[0]}
                  strokeWidth={3}
                  dot={{ r: 5, fill: COLORS[0] }}
                  activeDot={{ r: 8, fill: COLORS[0] }}
                  name={yField.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          </div>
        ),
      }

    case CHART_TYPES.AREA:
      return {
        component: (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-muted-foreground">X-Axis:</span>
                  <p className="mt-1 font-medium">{formatFieldName(xField)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Time period or sequence</p>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground">Y-Axis:</span>
                  <p className="mt-1 font-medium">{formatFieldName(yField)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Cumulative or stacked values</p>
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={height}>
              <AreaChart {...commonProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey={xField}
                  label={{ value: formatFieldName(xField), position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--foreground))', fontSize: 14, fontWeight: 600 } }}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis 
                  label={{ value: formatFieldName(yField), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--foreground))', fontSize: 14, fontWeight: 600 } }}
                />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey={yField}
                stroke={COLORS[0]}
                fill={COLORS[0]}
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        ),
      }

    case CHART_TYPES.PIE:
      // Limit pie chart to top 10 items for readability
      const pieData = data.length > 10 
        ? [...data].sort((a, b) => (b[yField] || 0) - (a[yField] || 0)).slice(0, 10)
        : data
      
      const total = pieData.reduce((sum, item) => sum + (Number(item[yField]) || 0), 0)
      
      return {
        component: (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-muted-foreground">Categories:</span>
                  <p className="mt-1 font-medium">{formatFieldName(xField)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Different segments or groups</p>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground">Values:</span>
                  <p className="mt-1 font-medium">{formatFieldName(yField)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Size of each segment</p>
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={height}>
              <PieChart>
              <Pie
                data={pieData}
                dataKey={yField}
                nameKey={xField}
                cx="50%"
                cy="50%"
                outerRadius={Math.min(140, height / 3)}
                innerRadius={Math.min(60, height / 6)}
                paddingAngle={2}
                label={({ name, percent, value }) => {
                  const displayName = String(name).length > 15 
                    ? String(name).substring(0, 15) + '...' 
                    : String(name)
                  return `${displayName}: ${(percent * 100).toFixed(1)}%`
                }}
                labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
              >
                {pieData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[index % COLORS.length]}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    const value = data[yField]
                    const percent = ((value / total) * 100).toFixed(2)
                    return (
                      <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
                        <p className="font-semibold mb-1">{data[xField]}</p>
                        <p className="text-sm" style={{ color: payload[0].color }}>
                          Value: {formatTooltipValue(value, yField)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Percentage: {percent}%
                        </p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Legend 
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                wrapperStyle={{ paddingTop: '20px' }}
              />
              {data.length > 10 && (
                <g>
                  <text 
                    x="50%" 
                    y="95%" 
                    textAnchor="middle" 
                    fill="hsl(var(--muted-foreground))"
                    fontSize="12"
                  >
                    Showing top 10 of {data.length} items
                  </text>
                </g>
              )}
            </PieChart>
          </ResponsiveContainer>
          </div>
        ),
      }

    default:
      return {
        component: null,
        error: `Unsupported chart type: ${chartSpec.type}`,
      }
  }
}

/**
 * Get default chart type based on data characteristics
 */
export function inferChartType(
  data: Record<string, any>[],
  columns: ColumnMetadata[]
): ChartSpec['type'] {
  if (data.length === 0) return 'table'
  if (data.length === 1) return 'kpi'

  // Check for date/timestamp columns
  const hasDateColumn = columns.some(col => 
    /date|time|timestamp|created|updated/i.test(col.name)
  )

  if (hasDateColumn) {
    return 'line'
  }

  // Check for numeric columns
  const numericColumns = columns.filter(col => 
    col.type === 'integer' || col.type === 'decimal'
  )

  if (numericColumns.length >= 2) {
    return 'bar'
  }

  return 'table'
}

