'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ReasoningPanel } from './ReasoningPanel'
import { SqlPanel } from './SqlPanel'
import { DataTable } from './DataTable'
import { ChartPanel } from './ChartPanel'
import type { QueryResponse } from '@/types'

interface ResultsPanelProps {
  response: QueryResponse | null
  isLoading: boolean
}

export function ResultsPanel({ response, isLoading }: ResultsPanelProps) {
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

  if (response.error) {
    return (
      <Card className="neumorphic-card border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>{response.error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <ReasoningPanel reasoning={response.reasoning || 'An error occurred while processing your query.'} />
        </CardContent>
      </Card>
    )
  }

  return (
    <Tabs defaultValue="reasoning" className="w-full">
      <TabsList className="neumorphic-card grid w-full grid-cols-4 p-1 gap-1">
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
          Data {response.data && response.data.length > 0 && `(${response.data.length})`}
        </TabsTrigger>
        <TabsTrigger 
          value="chart" 
          className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-md transition-all hover:underline focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Chart
        </TabsTrigger>
      </TabsList>
      <TabsContent value="reasoning" className="mt-4 animate-in fade-in-50 duration-300">
        <ReasoningPanel reasoning={response.reasoning} metricsInfo={response.metricsInfo} />
      </TabsContent>
      <TabsContent value="sql" className="mt-4 animate-in fade-in-50 duration-300">
        <SqlPanel 
          sql={response.sql} 
          preview_sql={response.preview_sql} 
          action_sql={response.action_sql} 
        />
      </TabsContent>
      <TabsContent value="data" className="mt-4 animate-in fade-in-50 duration-300">
        <DataTable data={response.data || []} columns={response.columns || []} />
      </TabsContent>
      <TabsContent value="chart" className="mt-4 animate-in fade-in-50 duration-300">
        <ChartPanel 
          data={response.data || []} 
          chartSpec={response.chartSpec || { type: 'table', xField: null, yField: null }} 
          columns={response.columns || []} 
        />
      </TabsContent>
    </Tabs>
  )
}

