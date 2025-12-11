import React, { useEffect, useRef } from 'react'
import { BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from 'recharts'
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

  // Enhanced margins and spacing for clean presentation - no clipping
  const commonProps = {
    data,
    margin: { top: 30, right: 40, left: 60, bottom: 100 }, // Increased for labels and spacing
  }
  
  // Calculate optimal bar size and spacing based on data density and available space
  const dataLength = data.length
  
  // Dynamic bar sizing based on data count
  // For few bars: make them wider, for many bars: make them narrower
  let barSize: number | undefined
  let barCategoryGap: string
  
  if (dataLength <= 5) {
    // Few bars: make them wide and spaced out
    barSize = undefined // Let Recharts auto-size
    barCategoryGap = '20%'
  } else if (dataLength <= 10) {
    barSize = 50
    barCategoryGap = '15%'
  } else if (dataLength <= 20) {
    barSize = 35
    barCategoryGap = '10%'
  } else if (dataLength <= 30) {
    barSize = 25
    barCategoryGap = '8%'
  } else {
    // Many bars: make them narrow and close together
    barSize = 20
    barCategoryGap = '5%'
  }
  
  // Smart label truncation for long labels
  const truncateLabel = (label: string, maxLength: number = 15): string => {
    if (!label) return ''
    if (label.length <= maxLength) return label
    return label.substring(0, maxLength - 3) + '...'
  }
  
  // Determine if labels should be rotated based on data density and label length
  const shouldRotateLabels = () => {
    if (dataLength > 15) return true
    // Check if any label is long
    const sampleLabels = data.slice(0, 5).map(d => String(d[xField] || ''))
    return sampleLabels.some(label => label.length > 12)
  }
  
  const labelAngle = shouldRotateLabels() ? -45 : 0
  const labelHeight = shouldRotateLabels() ? 120 : 80
  
  // Calculate Y-axis domain based on actual data values
  const calculateYAxisDomain = (): [number, number] => {
    if (!yField || data.length === 0) return [0, 100]
    
    // Extract all yField values and convert to numbers
    const values = data
      .map(row => {
        const val = row[yField]
        if (val === null || val === undefined) return null
        const num = typeof val === 'number' ? val : Number(val)
        return isNaN(num) ? null : num
      })
      .filter((v): v is number => v !== null)
    
    if (values.length === 0) return [0, 100]
    
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    
    // Add 10% padding to the top, but ensure minimum is 0 for positive values
    const padding = maxValue * 0.1
    const domainMax = maxValue + padding
    
    // If all values are positive, start from 0, otherwise use min with padding
    const domainMin = minValue >= 0 ? 0 : minValue - padding
    
    return [domainMin, domainMax]
  }
  
  const yAxisDomain = calculateYAxisDomain()

  // Format field names for display with better labels
  const formatFieldName = (fieldName: string): string => {
    if (!fieldName) return ''
    
    // Map common column names to human-readable labels
    const labelMap: Record<string, string> = {
      'City': 'City',
      'State': 'State',
      'city': 'City',
      'state': 'State',
      'LonD': 'Longitude (Degrees)',
      'LonM': 'Longitude (Minutes)',
      'LonS': 'Longitude (Seconds)',
      'EW': 'East/West',
      'LatD': 'Latitude (Degrees)',
      'LatM': 'Latitude (Minutes)',
      'LatS': 'Latitude (Seconds)',
      'NS': 'North/South',
      'count': 'Number of Cities',
      'Count': 'Number of Cities',
      'COUNT': 'Number of Cities',
      'total': 'Total',
      'Total': 'Total',
      'avg': 'Average',
      'Avg': 'Average',
      'AVG': 'Average',
      'sum': 'Sum',
      'Sum': 'Sum',
      'SUM': 'Sum',
    }
    
    // Check exact match first
    if (labelMap[fieldName]) {
      return labelMap[fieldName]
    }
    
    // Check case-insensitive match
    const lowerField = fieldName.toLowerCase()
    for (const [key, value] of Object.entries(labelMap)) {
      if (key.toLowerCase() === lowerField) {
        return value
      }
    }
    
    // Default formatting: replace underscores, capitalize words
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
  const formatTooltipValue = (value: unknown, name: string) => {
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
  interface TooltipProps {
    active?: boolean
    payload?: Array<{ name?: string; value?: unknown; color?: string }>
    label?: string
  }
  
  const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((entry, index: number) => (
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
      const BarChartWrapper = () => {
        const scrollRef = useRef<HTMLDivElement>(null)
        
        useEffect(() => {
          // Center the chart vertically on mount
          if (scrollRef.current) {
            const container = scrollRef.current
            const scrollHeight = container.scrollHeight
            const clientHeight = container.clientHeight
            // Scroll to center
            container.scrollTop = (scrollHeight - clientHeight) / 2
          }
        }, [])
        
        return (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 border border-border">
              <div className="flex gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">X-Axis:</span>
                  <span className="font-medium">{formatFieldName(xField)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">Y-Axis:</span>
                  <span className="font-medium">{formatFieldName(yField)}</span>
                </div>
              </div>
            </div>
            <div 
              ref={scrollRef}
              className="overflow-x-auto overflow-y-scroll border border-border rounded-lg p-4 bg-background" 
              style={{ cursor: 'grab', maxHeight: '600px', height: '600px', scrollBehavior: 'smooth' }}
            >
              <div className="flex items-center justify-center" style={{ minWidth: '100%', minHeight: '100%', paddingTop: '20px', paddingBottom: '20px' }}>
                <div style={{ width: '100%' }}>
                  <ResponsiveContainer width="100%" height={height}>
                    <BarChart 
                      {...commonProps} 
                      barSize={barSize} 
                      barCategoryGap={barCategoryGap}
                      maxBarSize={dataLength <= 10 ? 80 : dataLength <= 20 ? 60 : 40}
                    >
                    <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="hsl(var(--border))" 
                  opacity={0.15}
                  vertical={false}
                />
                <XAxis 
                  dataKey={xField}
                  label={{ 
                    value: formatFieldName(xField), 
                    position: 'insideBottom', 
                    offset: -10, 
                    style: { 
                      textAnchor: 'middle', 
                      fill: 'hsl(var(--foreground))', 
                      fontSize: 13, 
                      fontWeight: 600 
                    } 
                  }}
                  angle={labelAngle}
                  textAnchor={labelAngle < 0 ? "end" : "middle"}
                  height={labelHeight}
                  tick={{ 
                    fill: 'hsl(var(--muted-foreground))', 
                    fontSize: 11
                  }}
                  tickFormatter={(value) => truncateLabel(String(value), 18)}
                  interval="preserveStartEnd"
                  minTickGap={labelAngle < 0 ? 20 : 10}
                  allowDataOverflow={false}
                />
                <YAxis 
                      label={{ 
                        value: formatFieldName(yField), 
                        angle: -90, 
                        position: 'insideLeft', 
                        offset: -10,
                        style: { 
                          textAnchor: 'middle', 
                          fill: 'hsl(var(--foreground))', 
                          fontSize: 16, 
                          fontWeight: 700 
                        } 
                      }}
                      tick={{ 
                        fill: 'hsl(var(--foreground))', 
                        fontSize: 14,
                        fontWeight: 500
                      }}
                      tickFormatter={formatYAxis}
                      width={75}
                      allowDecimals={false}
                      domain={yAxisDomain}
                    />
                    <Tooltip 
                      content={<CustomTooltip />}
                      cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                    />
                    <Legend 
                      wrapperStyle={{ paddingTop: '25px', paddingBottom: '10px' }}
                      iconType="rect"
                      iconSize={12}
                      fontSize={11}
                    />
                    <Bar 
                      dataKey={yField} 
                      fill={COLORS[0]}
                      radius={[6, 6, 0, 0]}
                      name={formatFieldName(yField)}
                      isAnimationActive={true}
                      animationDuration={800}
                    >
                      {data.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )
      }
      
      return {
        component: <BarChartWrapper />,
      }

    case CHART_TYPES.LINE:
      const seriesField = chartSpec.seriesField
      const hasMultipleSeries = seriesField && data.some(row => row[seriesField])
      
      return {
        component: (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 border border-border">
              <div className="flex gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">X-Axis:</span>
                  <span className="font-medium">{formatFieldName(xField)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">Y-Axis:</span>
                  <span className="font-medium">{formatFieldName(yField)}</span>
                </div>
                {hasMultipleSeries && seriesField && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-muted-foreground">Series:</span>
                    <span className="font-medium">{formatFieldName(seriesField)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-scroll border border-border rounded-lg p-4 bg-background" style={{ cursor: 'grab', maxHeight: '600px', height: '600px', scrollBehavior: 'smooth' }}>
              <div style={{ minWidth: '100%', paddingBottom: '20px', minHeight: height + (labelAngle < 0 ? 150 : 100) }}>
                <ResponsiveContainer width="100%" height={height}>
                  <LineChart {...commonProps}>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="hsl(var(--border))" 
                      opacity={0.15}
                      vertical={false}
                    />
                    <XAxis 
                      dataKey={xField}
                      label={{ 
                        value: formatFieldName(xField), 
                        position: 'insideBottom', 
                        offset: -10, 
                        style: { 
                          textAnchor: 'middle', 
                          fill: 'hsl(var(--foreground))', 
                          fontSize: 13, 
                          fontWeight: 600 
                        } 
                      }}
                      angle={labelAngle}
                      textAnchor={labelAngle < 0 ? "end" : "middle"}
                      height={labelHeight}
                      tick={{ 
                        fill: 'hsl(var(--muted-foreground))', 
                        fontSize: 11
                      }}
                      tickFormatter={(value) => truncateLabel(String(value), 18)}
                      interval="preserveStartEnd"
                      minTickGap={labelAngle < 0 ? 20 : 10}
                      allowDataOverflow={false}
                    />
                    <YAxis 
                      label={{ 
                        value: formatFieldName(yField), 
                        angle: -90, 
                        position: 'insideLeft', 
                        offset: -10,
                        style: { 
                          textAnchor: 'middle', 
                          fill: 'hsl(var(--foreground))', 
                          fontSize: 16, 
                          fontWeight: 700 
                        } 
                      }}
                      tick={{ 
                        fill: 'hsl(var(--foreground))', 
                        fontSize: 14,
                        fontWeight: 500
                      }}
                      tickFormatter={formatYAxis}
                      width={75}
                      allowDecimals={false}
                      domain={yAxisDomain}
                    />
                    <Tooltip 
                      content={<CustomTooltip />}
                      cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '5 5' }}
                    />
                    <Legend 
                      wrapperStyle={{ paddingTop: '25px', paddingBottom: '10px' }}
                      iconType="line"
                      iconSize={14}
                      fontSize={11}
                    />
                    {hasMultipleSeries && seriesField ? (
                      // Multiple series - render one line per series (lines on top with zIndex)
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
                            dot={{ r: 4, fill: COLORS[idx % COLORS.length], strokeWidth: 2 }}
                            activeDot={{ r: 6, strokeWidth: 2 }}
                            name={String(seriesValue)}
                            isAnimationActive={true}
                            animationDuration={800}
                          />
                        ))
                      })()
                    ) : (
                      <Line
                        type="monotone"
                        dataKey={yField}
                        stroke={COLORS[0]}
                        strokeWidth={3}
                        dot={{ r: 5, fill: COLORS[0], strokeWidth: 2 }}
                        activeDot={{ r: 8, fill: COLORS[0], strokeWidth: 2 }}
                        name={formatFieldName(yField)}
                        isAnimationActive={true}
                        animationDuration={800}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ),
      }

    case CHART_TYPES.AREA:
      return {
        component: (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 border border-border">
              <div className="flex gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">X-Axis:</span>
                  <span className="font-medium">{formatFieldName(xField)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">Y-Axis:</span>
                  <span className="font-medium">{formatFieldName(yField)}</span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-scroll border border-border rounded-lg p-4 bg-background" style={{ cursor: 'grab', maxHeight: '600px', height: '600px', scrollBehavior: 'smooth' }}>
              <div style={{ minWidth: '100%', paddingBottom: '20px', minHeight: height + (labelAngle < 0 ? 150 : 100) }}>
                <ResponsiveContainer width="100%" height={height}>
                  <AreaChart {...commonProps}>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="hsl(var(--border))" 
                      opacity={0.15}
                      vertical={false}
                    />
                    <XAxis 
                      dataKey={xField}
                      label={{ 
                        value: formatFieldName(xField), 
                        position: 'insideBottom', 
                        offset: -10, 
                        style: { 
                          textAnchor: 'middle', 
                          fill: 'hsl(var(--foreground))', 
                          fontSize: 13, 
                          fontWeight: 600 
                        } 
                      }}
                      angle={labelAngle}
                      textAnchor={labelAngle < 0 ? "end" : "middle"}
                      height={labelHeight}
                      tick={{ 
                        fill: 'hsl(var(--muted-foreground))', 
                        fontSize: 11
                      }}
                      tickFormatter={(value) => truncateLabel(String(value), 18)}
                      interval="preserveStartEnd"
                      minTickGap={labelAngle < 0 ? 20 : 10}
                      allowDataOverflow={false}
                    />
                    <YAxis 
                      label={{ 
                        value: formatFieldName(yField), 
                        angle: -90, 
                        position: 'insideLeft', 
                        offset: -10,
                        style: { 
                          textAnchor: 'middle', 
                          fill: 'hsl(var(--foreground))', 
                          fontSize: 16, 
                          fontWeight: 700 
                        } 
                      }}
                      tick={{ 
                        fill: 'hsl(var(--foreground))', 
                        fontSize: 14,
                        fontWeight: 500
                      }}
                      tickFormatter={formatYAxis}
                      width={75}
                      allowDecimals={false}
                      domain={yAxisDomain}
                    />
                    <Tooltip 
                      content={<CustomTooltip />}
                      cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '5 5' }}
                    />
                    <Legend 
                      wrapperStyle={{ paddingTop: '25px', paddingBottom: '10px' }}
                      iconType="circle"
                      iconSize={12}
                      fontSize={11}
                    />
                    <Area
                      type="monotone"
                      dataKey={yField}
                      stroke={COLORS[0]}
                      fill={COLORS[0]}
                      fillOpacity={0.4}
                      strokeWidth={2.5}
                      name={formatFieldName(yField)}
                      isAnimationActive={true}
                      animationDuration={800}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ),
      }

    case CHART_TYPES.PIE:
      // For pie charts with many items, group small slices into "Others"
      // This prevents label overlapping and makes the chart readable
      const MAX_PIE_ITEMS = 12 // Show top 12 items, group rest as "Others"
      
      let pieData = [...data]
      let othersData: { name: string; value: number } | null = null
      
      // Sort by yField value (descending) to get top items
      if (yField && typeof data[0]?.[yField] === 'number') {
        pieData = [...data].sort((a, b) => (Number(b[yField]) || 0) - (Number(a[yField]) || 0))
      }
      
      // If too many items, group the rest
      if (pieData.length > MAX_PIE_ITEMS) {
        const topItems = pieData.slice(0, MAX_PIE_ITEMS)
        const restItems = pieData.slice(MAX_PIE_ITEMS)
        
        // Calculate sum of "Others"
        const othersSum = restItems.reduce((sum, item) => {
          const val = Number(item[yField]) || 0
          return sum + val
        }, 0)
        
        if (othersSum > 0) {
          othersData = {
            [xField]: `Others (${restItems.length} items)`,
            [yField]: othersSum,
          }
          pieData = [...topItems, othersData]
        } else {
          pieData = topItems
        }
      }
      
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
                innerRadius={pieData.length > 8 ? Math.min(60, height / 6) : 0} // Donut for many items
                paddingAngle={2}
                labelLine={pieData.length <= 8} // Only show label lines for 8 or fewer items
                label={pieData.length <= 8 ? ({ name, percent, value }) => {
                  // Only show labels for significant slices (>2%) or top items
                  if (percent > 0.02 || pieData.length <= 5) {
                    const displayName = String(name).length > 15 
                      ? String(name).substring(0, 15) + '...' 
                      : String(name)
                    return `${displayName}: ${(percent * 100).toFixed(1)}%`
                  }
                  return ''
                } : false} // No labels if too many items - use legend instead
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
                height={Math.min(200, pieData.length * 20 + 40)}
                iconType="circle"
                wrapperStyle={{ paddingTop: '20px' }}
                formatter={(value: string) => {
                  // Truncate long names in legend
                  return value.length > 30 ? value.substring(0, 30) + '...' : value
                }}
              />
              {data.length > MAX_PIE_ITEMS && (
                <g>
                  <text 
                    x="50%" 
                    y="95%" 
                    textAnchor="middle" 
                    fill="hsl(var(--muted-foreground))"
                    fontSize="12"
                  >
                    Showing top {MAX_PIE_ITEMS} of {data.length} items. Others grouped.
                  </text>
                </g>
              )}
            </PieChart>
          </ResponsiveContainer>
          </div>
        ),
      }

    case CHART_TYPES.SCATTER:
      return {
        component: (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 border border-border">
              <div className="flex gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">X-Axis:</span>
                  <span className="font-medium">{formatFieldName(xField)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">Y-Axis:</span>
                  <span className="font-medium">{formatFieldName(yField)}</span>
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={height}>
              <ScatterChart {...commonProps}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.15} />
                <XAxis 
                  type="number"
                  dataKey={xField}
                  name={formatFieldName(xField)}
                  tickFormatter={formatYAxis}
                />
                <YAxis 
                  type="number"
                  dataKey={yField}
                  name={formatFieldName(yField)}
                  tickFormatter={formatYAxis}
                />
                <Tooltip content={CustomTooltip} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter 
                  name="Data Points" 
                  data={data} 
                  fill={COLORS[0]}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ),
      }

    case CHART_TYPES.HEATMAP:
      // For heatmap, we need to create a grid of values
      // This is a simplified version - in production you'd want more sophisticated binning
      const heatmapData = data.map((row, index) => ({
        x: index,
        y: typeof row[yField] === 'number' ? row[yField] : 0,
        value: typeof row[yField] === 'number' ? row[yField] : 0,
      }))

      return {
        component: (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 border border-border">
              <div className="flex gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">X-Axis:</span>
                  <span className="font-medium">{formatFieldName(xField)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">Y-Axis:</span>
                  <span className="font-medium">{formatFieldName(yField)}</span>
                </div>
              </div>
            </div>
            <div className="p-4 border border-border rounded-lg bg-muted/20">
              <div className="grid grid-cols-10 gap-1">
                {heatmapData.slice(0, 100).map((item, idx) => {
                  const intensity = Math.min(1, item.value / (Math.max(...heatmapData.map(d => d.value)) || 1))
                  const colorIntensity = Math.floor(intensity * 255)
                  return (
                    <div
                      key={idx}
                      className="aspect-square rounded-sm border border-border/50"
                      style={{
                        backgroundColor: `rgba(59, 130, 246, ${intensity})`,
                      }}
                      title={`Value: ${item.value}`}
                    />
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Heatmap visualization (showing first 100 data points)
              </p>
            </div>
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

