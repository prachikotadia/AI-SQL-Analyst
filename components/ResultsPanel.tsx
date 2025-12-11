'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useRef } from 'react'
import { ReasoningPanel } from './ReasoningPanel'
import { SqlPanel } from './SqlPanel'
import { DataTable } from './DataTable'
import { ChartPanel } from './ChartPanel'
import { PerformanceMetrics } from './PerformanceMetrics'
import { DataInsightsPanel } from './DataInsightsPanel'
import { ExportButton } from './ExportButton'
import { QueryExplanation } from './QueryExplanation'
import { ShareButton } from './ShareButton'
import { BookmarkButton } from './BookmarkButton'
import type { QueryResponse } from '@/types'

interface ResultsPanelProps {
  response: QueryResponse | null
  isLoading: boolean
  query?: string
  chatId?: string
}

export function ResultsPanel({ response, isLoading, query, chatId }: ResultsPanelProps) {
  const chartElementRef = useRef<HTMLDivElement>(null)
  
  // If loading, show skeleton
  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in-50 duration-300">
        <Card className="neumorphic-card">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
            <div className="space-y-2 pt-4">
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
            <div className="space-y-2 pt-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          </CardContent>
        </Card>
        <Card className="neumorphic-card">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show empty state only if response is truly null/undefined
  // Always show tabs if response exists (even with empty data)
  if (!response) {
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
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <path d="M13 8H8" />
                <path d="M13 12H8" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-medium text-lg mb-1">Ready to Query</p>
              <p className="text-sm text-muted-foreground">
                Enter a natural language question above to see results
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Always show all 4 tabs: Reasoning, SQL, Data, Chart
  // Even when there's an error, show all sections with available data
  
  // Ensure we always have a valid response structure
  const safeResponse = response || {
    data: [],
    columns: [],
    reasoning: 'No response available',
    preview_sql: null,
    action_sql: null,
    sql: '',
    chartSpec: { type: 'table', xField: null, yField: null },
    error: null,
  }
  
  return (
    <div className="w-full space-y-4">
      {/* Performance Metrics */}
      {safeResponse.performanceMetrics && (
        <PerformanceMetrics
          executionTimeMs={safeResponse.performanceMetrics.executionTimeMs}
          tokenUsage={safeResponse.performanceMetrics.tokenUsage}
          queryComplexity={safeResponse.performanceMetrics.queryComplexity}
          sqlLength={safeResponse.performanceMetrics.sqlLength}
        />
      )}

      {safeResponse.error && (
        <Card className="neumorphic-card border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>{safeResponse.error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Export Button, Share Button, Bookmark Button, and Query Explanation */}
      {safeResponse.data && safeResponse.data.length > 0 && (
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <QueryExplanation
              sql={safeResponse.sql || safeResponse.preview_sql || ''}
              query={safeResponse.reasoning || ''}
              reasoning={safeResponse.reasoning || ''}
            />
            {query && <BookmarkButton query={query} response={safeResponse} />}
          </div>
          <div className="flex items-center gap-2">
            <ShareButton response={safeResponse} query={query} chatId={chatId} />
            <ExportButton
              data={safeResponse.data}
              columns={safeResponse.columns}
              chartElementRef={chartElementRef}
              query={safeResponse.reasoning || ''}
              reasoning={safeResponse.reasoning || ''}
              sql={safeResponse.sql || safeResponse.preview_sql || ''}
              filename="query-results"
            />
          </div>
        </div>
      )}

      <Tabs defaultValue="reasoning" className="w-full">
        <TabsList className="neumorphic-card grid w-full grid-cols-5 p-1 gap-1" style={{ display: 'grid' }}>
          <TabsTrigger 
            value="reasoning" 
            className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-md transition-all hover:underline focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Reasoning
          </TabsTrigger>
          <TabsTrigger 
            value="sql" 
            className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-md transition-all hover:underline focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            SQL
          </TabsTrigger>
          <TabsTrigger 
            value="data" 
            className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-md transition-all hover:underline focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Data {safeResponse.data && safeResponse.data.length > 0 && `(${safeResponse.data.length})`}
          </TabsTrigger>
          <TabsTrigger 
            value="chart" 
            className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-md transition-all hover:underline focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Chart
          </TabsTrigger>
          <TabsTrigger 
            value="insights" 
            className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-md transition-all hover:underline focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Insights
          </TabsTrigger>
        </TabsList>
        <TabsContent value="reasoning" className="mt-4 animate-in fade-in-50 duration-300">
          <ReasoningPanel reasoning={safeResponse.reasoning || 'No reasoning available.'} metricsInfo={safeResponse.metricsInfo} />
        </TabsContent>
        <TabsContent value="sql" className="mt-4 animate-in fade-in-50 duration-300">
          <SqlPanel 
            sql={safeResponse.sql} 
            preview_sql={safeResponse.preview_sql} 
            action_sql={safeResponse.action_sql} 
          />
        </TabsContent>
        <TabsContent value="data" className="mt-4 animate-in fade-in-50 duration-300">
          <DataTable data={safeResponse.data || []} columns={safeResponse.columns || []} />
        </TabsContent>
        <TabsContent value="chart" className="mt-4 animate-in fade-in-50 duration-300">
          <div ref={chartElementRef}>
            <ChartPanel 
              data={safeResponse.data || []} 
              chartSpec={safeResponse.chartSpec || { type: 'table', xField: null, yField: null }} 
              columns={safeResponse.columns || []} 
            />
          </div>
        </TabsContent>
        <TabsContent value="insights" className="mt-4 animate-in fade-in-50 duration-300">
          <DataInsightsPanel 
            data={safeResponse.data || []} 
            columns={safeResponse.columns || []} 
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

