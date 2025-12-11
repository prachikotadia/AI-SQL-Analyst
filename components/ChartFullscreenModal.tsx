'use client'

import { useState, useEffect } from 'react'
import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import type { ChartSpec, ColumnMetadata } from '@/types'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts'

interface ChartFullscreenModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: Record<string, any>[]
  chartSpec: ChartSpec
  columns: ColumnMetadata[]
  chartType: 'bar' | 'pie' | 'line'
  title: string
  description?: string
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1',
]

export function ChartFullscreenModal({
  open,
  onOpenChange,
  data,
  chartSpec,
  columns,
  chartType,
  title,
  description,
}: ChartFullscreenModalProps) {
  const [zoomLevel, setZoomLevel] = useState(1)
  const [brushStartIndex, setBrushStartIndex] = useState(0)
  const [brushEndIndex, setBrushEndIndex] = useState(Math.max(0, data.length - 1))

  // Ensure indices are valid when data changes
  useEffect(() => {
    if (data.length > 0) {
      setBrushStartIndex(0)
      setBrushEndIndex(Math.max(0, data.length - 1))
    }
  }, [data.length])

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.2, 3))
  }

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.2, 0.5))
  }

  const handleReset = () => {
    setZoomLevel(1)
    setBrushStartIndex(0)
    setBrushEndIndex(Math.max(0, data.length - 1))
  }

  // Validate and clamp indices - ensure they're valid numbers
  const safeStartIndex = data.length > 0 
    ? Math.max(0, Math.min(Math.floor(brushStartIndex || 0), data.length - 1))
    : 0
  const safeEndIndex = data.length > 0
    ? Math.max(safeStartIndex, Math.min(Math.floor(brushEndIndex || 0), data.length - 1))
    : 0
  const visibleData = data.length > 0 && safeStartIndex >= 0 && safeEndIndex >= safeStartIndex
    ? data.slice(safeStartIndex, safeEndIndex + 1)
    : data

  const formatFieldName = (fieldName: string): string => {
    if (!fieldName) return ''
    return fieldName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim()
  }

  const xField = chartSpec.xField || ''
  const yField = chartSpec.yField || ''
  
  // Ensure data has valid xField values for Brush
  const hasValidXField = xField && data.length > 0 && data.some(row => row[xField] != null)
  
  // Ensure indices are valid numbers (not NaN)
  const isValidBrush = data.length > 10 && 
                       hasValidXField && 
                       !isNaN(safeStartIndex) && 
                       !isNaN(safeEndIndex) &&
                       safeStartIndex >= 0 && 
                       safeEndIndex >= safeStartIndex && 
                       safeEndIndex < data.length

  const renderFullscreenChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={data}
              margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center' }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey={xField}
                angle={-45}
                textAnchor="end"
                height={120}
                tick={{ fontSize: 12 }}
                interval={Math.max(0, Math.floor(data.length / 20))}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                label={{ value: formatFieldName(yField), angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  padding: '8px',
                }}
                formatter={(value: any, name: string) => [
                  typeof value === 'number' ? value.toLocaleString() : value,
                  formatFieldName(name),
                ]}
                labelFormatter={(label) => `${formatFieldName(xField)}: ${label}`}
              />
              <Legend />
                    <Bar
                      dataKey={yField}
                      fill={COLORS[0]}
                      radius={[6, 6, 0, 0]}
                      name={formatFieldName(yField)}
                    >
                      {data.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Bar>
              {isValidBrush && (
                <Brush
                  dataKey={xField}
                  height={30}
                  startIndex={safeStartIndex}
                  endIndex={safeEndIndex}
                  onChange={(e: any) => {
                    if (e && typeof e.startIndex === 'number' && typeof e.endIndex === 'number' && !isNaN(e.startIndex) && !isNaN(e.endIndex)) {
                      const newStart = Math.max(0, Math.min(Math.floor(e.startIndex), data.length - 1))
                      const newEnd = Math.max(newStart, Math.min(Math.floor(e.endIndex), data.length - 1))
                      if (!isNaN(newStart) && !isNaN(newEnd) && newStart >= 0 && newEnd >= newStart && newEnd < data.length) {
                        setBrushStartIndex(newStart)
                        setBrushEndIndex(newEnd)
                      }
                    }
                  }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={data}
              margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center' }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey={xField}
                angle={-45}
                textAnchor="end"
                height={120}
                tick={{ fontSize: 12 }}
                interval={Math.max(0, Math.floor(data.length / 20))}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                label={{ value: formatFieldName(yField), angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  padding: '8px',
                }}
                formatter={(value: any, name: string) => [
                  typeof value === 'number' ? value.toLocaleString() : value,
                  formatFieldName(name),
                ]}
                labelFormatter={(label) => `${formatFieldName(xField)}: ${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey={yField}
                stroke={COLORS[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                name={formatFieldName(yField)}
              />
              {isValidBrush && (
                <Brush
                  dataKey={xField}
                  height={30}
                  startIndex={safeStartIndex}
                  endIndex={safeEndIndex}
                  onChange={(e: any) => {
                    if (e && typeof e.startIndex === 'number' && typeof e.endIndex === 'number' && !isNaN(e.startIndex) && !isNaN(e.endIndex)) {
                      const newStart = Math.max(0, Math.min(Math.floor(e.startIndex), data.length - 1))
                      const newEnd = Math.max(newStart, Math.min(Math.floor(e.endIndex), data.length - 1))
                      if (!isNaN(newStart) && !isNaN(newEnd) && newStart >= 0 && newEnd >= newStart && newEnd < data.length) {
                        setBrushStartIndex(newStart)
                        setBrushEndIndex(newEnd)
                      }
                    }
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )

      case 'pie':
        // For pie charts with many items, group small slices into "Others"
        // This prevents label overlapping and makes the chart readable
        const MAX_PIE_ITEMS = 12 // Show top 12 items, group rest as "Others"
        
        let pieData = [...data]
        let othersData: any = null
        
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
        
        // Calculate total for percentage display
        const total = pieData.reduce((sum, item) => sum + (Number(item[yField]) || 0), 0)
        
        return (
          <div className="flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={400}>
              <PieChart style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center' }}>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={pieData.length <= 8} // Only show label lines for 8 or fewer items
                  label={pieData.length <= 8 ? ({ name, percent, value }) => {
                    // Only show labels for significant slices (>2%) or top items
                    if (percent > 0.02 || pieData.length <= 5) {
                      const displayName = String(name).length > 20 
                        ? String(name).substring(0, 20) + '...' 
                        : String(name)
                      return `${displayName}\n${(percent * 100).toFixed(1)}%`
                    }
                    return ''
                  } : false} // No labels if too many items - use legend instead
                  outerRadius={Math.min(220, 600 / 3)}
                  innerRadius={pieData.length > 8 ? Math.min(80, 600 / 8) : 0} // Donut chart for many items
                  paddingAngle={2}
                  fill="#8884d8"
                  dataKey={yField}
                  nameKey={xField}
                >
                  {pieData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    padding: '8px',
                  }}
                  formatter={(value: any, name: string, props: any) => {
                    const percent = total > 0 ? ((Number(value) / total) * 100).toFixed(1) : '0'
                    return [
                      `${typeof value === 'number' ? value.toLocaleString() : value} (${percent}%)`,
                      formatFieldName(name),
                    ]
                  }}
                  labelFormatter={(label) => `${formatFieldName(xField)}: ${label}`}
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
              </PieChart>
            </ResponsiveContainer>
            {data.length > MAX_PIE_ITEMS && (
              <p className="text-sm text-muted-foreground mt-4 text-center">
                Showing top {MAX_PIE_ITEMS} items. {data.length - MAX_PIE_ITEMS} smaller items grouped as &quot;Others&quot;.
              </p>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 text-base sm:text-lg">
            <span className="break-words">{title}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] text-xs sm:text-sm"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.5}
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3}
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                title="Reset View"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
          {description && <DialogDescription className="text-xs sm:text-sm">{description}</DialogDescription>}
        </DialogHeader>

        <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
          {/* Chart */}
          <div className="border rounded-lg p-2 sm:p-4 bg-background overflow-x-auto">
            <div className="min-w-full">
              {renderFullscreenChart()}
            </div>
          </div>

          {/* Detailed Data Table */}
          <div className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Detailed Data ({visibleData.length} items)</h3>
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-background border-b">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.name}
                        className="px-4 py-2 text-left font-semibold border-b"
                      >
                        {formatFieldName(col.name)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleData.map((row, index) => (
                    <tr
                      key={index}
                      className="border-b hover:bg-muted/50 transition-colors"
                    >
                      {columns.map((col) => (
                        <td key={col.name} className="px-4 py-2">
                          {typeof row[col.name] === 'number'
                            ? row[col.name].toLocaleString()
                            : String(row[col.name] || '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Statistics */}
          {yField && visibleData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground">Total Items</div>
                <div className="text-2xl font-bold">{visibleData.length}</div>
              </div>
              {typeof visibleData[0][yField] === 'number' && (
                <>
                  <div className="border rounded-lg p-4">
                    <div className="text-sm text-muted-foreground">Sum</div>
                    <div className="text-2xl font-bold">
                      {visibleData
                        .reduce((sum, row) => sum + (Number(row[yField]) || 0), 0)
                        .toLocaleString()}
                    </div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-sm text-muted-foreground">Average</div>
                    <div className="text-2xl font-bold">
                      {(
                        visibleData.reduce((sum, row) => sum + (Number(row[yField]) || 0), 0) /
                        visibleData.length
                      ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-sm text-muted-foreground">Max</div>
                    <div className="text-2xl font-bold">
                      {Math.max(
                        ...visibleData.map((row) => Number(row[yField]) || 0)
                      ).toLocaleString()}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
