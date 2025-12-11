'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Download, FileText, Image, FileSpreadsheet, File } from 'lucide-react'
import { exportToCSV, exportToExcel, exportChartAsImage, exportFullReport } from '@/lib/utils/exportUtils'
import { useToast } from '@/components/ui/use-toast'
import type { ColumnMetadata } from '@/types'

interface ExportButtonProps {
  data: Record<string, any>[]
  columns: ColumnMetadata[]
  chartElementRef?: React.RefObject<HTMLElement>
  query?: string
  reasoning?: string
  sql?: string
  filename?: string
}

export function ExportButton({
  data,
  columns,
  chartElementRef,
  query = '',
  reasoning = '',
  sql = '',
  filename = 'query-results',
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)
  const { toast } = useToast()

  const handleExport = async (type: 'csv' | 'excel' | 'chart-png' | 'chart-svg' | 'report') => {
    if (!data || data.length === 0) {
      toast({
        title: 'No data to export',
        description: 'Please run a query first to export results.',
        variant: 'destructive',
      })
      return
    }

    setIsExporting(true)
    try {
      switch (type) {
        case 'csv':
          exportToCSV(data, columns, `${filename}.csv`)
          toast({
            title: 'Exported to CSV',
            description: 'Your data has been exported successfully.',
          })
          break

        case 'excel':
          exportToExcel(data, columns, `${filename}.xlsx`)
          toast({
            title: 'Exported to Excel',
            description: 'Your data has been exported successfully.',
          })
          break

        case 'chart-png':
          if (!chartElementRef?.current) {
            toast({
              title: 'Chart not available',
              description: 'Please view the chart tab to export it.',
              variant: 'destructive',
            })
            return
          }
          exportChartAsImage(chartElementRef.current, `${filename}-chart.png`, 'png')
          toast({
            title: 'Chart exported',
            description: 'Your chart has been exported as PNG.',
          })
          break

        case 'chart-svg':
          if (!chartElementRef?.current) {
            toast({
              title: 'Chart not available',
              description: 'Please view the chart tab to export it.',
              variant: 'destructive',
            })
            return
          }
          exportChartAsImage(chartElementRef.current, `${filename}-chart.svg`, 'svg')
          toast({
            title: 'Chart exported',
            description: 'Your chart has been exported as SVG.',
          })
          break

        case 'report':
          await exportFullReport(
            data,
            columns,
            chartElementRef?.current || null,
            query,
            reasoning,
            sql,
            `${filename}-report.pdf`
          )
          toast({
            title: 'Report generated',
            description: 'Your full report is ready to print or save as PDF.',
          })
          break
      }
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error.message || 'Failed to export. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isExporting || !data || data.length === 0}
          className="gap-2 min-h-[44px] text-xs sm:text-sm"
        >
          <Download className="h-4 w-4" />
          {isExporting ? (
            <>
              <span className="hidden sm:inline">Exporting...</span>
              <span className="sm:hidden">...</span>
            </>
          ) : (
            'Export'
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 sm:w-56">
        <DropdownMenuItem onClick={() => handleExport('csv')} disabled={isExporting}>
          <FileText className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('excel')} disabled={isExporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as Excel
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleExport('chart-png')}
          disabled={isExporting || !chartElementRef?.current}
        >
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image className="h-4 w-4 mr-2" />
          Export Chart (PNG)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport('chart-svg')}
          disabled={isExporting || !chartElementRef?.current}
        >
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image className="h-4 w-4 mr-2" />
          Export Chart (SVG)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleExport('report')} disabled={isExporting}>
          <File className="h-4 w-4 mr-2" />
          Export Full Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
