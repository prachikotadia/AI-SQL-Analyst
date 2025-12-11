'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HelpCircle, Code, Database, Eye, Filter, Layers, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface QueryExplanationProps {
  sql: string
  query: string
  reasoning?: string
}

export function QueryExplanation({ sql, query, reasoning }: QueryExplanationProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!sql) return null

  // Parse SQL to extract components
  const parseSQL = (sqlQuery: string) => {
    const lowerSql = sqlQuery.toLowerCase()
    const components = {
      select: '',
      from: '',
      where: '',
      groupBy: '',
      orderBy: '',
      limit: '',
      joins: [] as string[],
      aggregations: [] as string[],
    }

    // Extract SELECT
    const selectMatch = sqlQuery.match(/SELECT\s+(.+?)\s+FROM/gi)
    if (selectMatch) {
      components.select = selectMatch[0].replace(/SELECT\s+/gi, '').replace(/\s+FROM/gi, '')
      // Check for aggregations
      if (components.select.match(/\b(COUNT|SUM|AVG|MAX|MIN)\s*\(/gi)) {
        components.aggregations = components.select.match(/\b(COUNT|SUM|AVG|MAX|MIN)\s*\([^)]+\)/gi) || []
      }
    }

    // Extract FROM
    const fromMatch = sqlQuery.match(/FROM\s+([^\s(]+)/gi)
    if (fromMatch) {
      components.from = fromMatch[0].replace(/FROM\s+/gi, '')
    }

    // Extract WHERE
    const whereMatch = sqlQuery.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/gi)
    if (whereMatch) {
      components.where = whereMatch[0].replace(/WHERE\s+/gi, '').replace(/\s+(GROUP\s+BY|ORDER\s+BY|LIMIT).*$/gi, '')
    }

    // Extract GROUP BY
    const groupByMatch = sqlQuery.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/gi)
    if (groupByMatch) {
      components.groupBy = groupByMatch[0].replace(/GROUP\s+BY\s+/gi, '').replace(/\s+(ORDER\s+BY|LIMIT).*$/gi, '')
    }

    // Extract ORDER BY
    const orderByMatch = sqlQuery.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/gi)
    if (orderByMatch) {
      components.orderBy = orderByMatch[0].replace(/ORDER\s+BY\s+/gi, '').replace(/\s+LIMIT.*$/gi, '')
    }

    // Extract LIMIT
    const limitMatch = sqlQuery.match(/LIMIT\s+(\d+)/gi)
    if (limitMatch) {
      components.limit = limitMatch[0].replace(/LIMIT\s+/gi, '')
    }

    // Extract JOINs
    const joinMatches = sqlQuery.match(/\b(INNER|LEFT|RIGHT|FULL)\s+JOIN\s+[^\s]+\s+ON\s+[^WHERE\s]+/gi)
    if (joinMatches) {
      components.joins = joinMatches
    }

    return components
  }

  const sqlComponents = parseSQL(sql)

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="gap-2 min-h-[44px] text-xs sm:text-sm"
      >
        <HelpCircle className="h-4 w-4" />
        <span className="hidden sm:inline">Explain Query</span>
        <span className="sm:hidden">Explain</span>
      </Button>
    )
  }

  return (
    <Card className="mt-4">
      <CardHeader className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5" />
              Query Explanation
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Step-by-step breakdown of the SQL query</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)} className="min-h-[44px] text-xs sm:text-sm">
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-6">
        <Tabs defaultValue="breakdown" className="w-full">
          <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
            <TabsList className="w-full min-w-max sm:min-w-0">
              <TabsTrigger value="breakdown" className="text-xs sm:text-sm min-h-[44px] px-3 sm:px-4">Breakdown</TabsTrigger>
              <TabsTrigger value="sql" className="text-xs sm:text-sm min-h-[44px] px-3 sm:px-4">SQL View</TabsTrigger>
              <TabsTrigger value="reasoning" className="text-xs sm:text-sm min-h-[44px] px-3 sm:px-4">Reasoning</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="breakdown" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-muted rounded-lg">
                <Database className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold mb-1 text-xs sm:text-sm">Data Source</div>
                  <div className="text-xs sm:text-sm text-muted-foreground break-words">
                    {sqlComponents.from || 'Not specified'}
                  </div>
                </div>
              </div>

              {sqlComponents.select && (
                <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-muted rounded-lg">
                  <Eye className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold mb-1 text-xs sm:text-sm">Selected Columns</div>
                    <div className="text-xs sm:text-sm text-muted-foreground font-mono break-words">
                      {sqlComponents.select}
                    </div>
                  </div>
                </div>
              )}

              {sqlComponents.aggregations.length > 0 && (
                <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-muted rounded-lg">
                  <Code className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold mb-1 text-xs sm:text-sm">Aggregations</div>
                    <div className="text-xs sm:text-sm text-muted-foreground break-words">
                      {sqlComponents.aggregations.join(', ')}
                    </div>
                  </div>
                </div>
              )}

              {sqlComponents.where && (
                <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-muted rounded-lg">
                  <Filter className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold mb-1 text-xs sm:text-sm">Filters</div>
                    <div className="text-xs sm:text-sm text-muted-foreground font-mono break-words">
                      {sqlComponents.where}
                    </div>
                  </div>
                </div>
              )}

              {sqlComponents.groupBy && (
                <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-muted rounded-lg">
                  <Layers className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold mb-1 text-xs sm:text-sm">Grouping</div>
                    <div className="text-xs sm:text-sm text-muted-foreground font-mono break-words">
                      {sqlComponents.groupBy}
                    </div>
                  </div>
                </div>
              )}

              {sqlComponents.orderBy && (
                <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-muted rounded-lg">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold mb-1 text-xs sm:text-sm">Sorting</div>
                    <div className="text-xs sm:text-sm text-muted-foreground font-mono break-words">
                      {sqlComponents.orderBy}
                    </div>
                  </div>
                </div>
              )}

              {sqlComponents.limit && (
                <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-muted rounded-lg">
                  <Code className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold mb-1 text-xs sm:text-sm">Limit</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      {sqlComponents.limit} rows
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="sql" className="mt-3 sm:mt-4">
            <pre className="p-3 sm:p-4 bg-muted rounded-lg overflow-x-auto text-xs sm:text-sm font-mono">
              <code className="break-words whitespace-pre-wrap">{sql}</code>
            </pre>
          </TabsContent>

          <TabsContent value="reasoning" className="mt-3 sm:mt-4">
            <div className="p-3 sm:p-4 bg-muted rounded-lg">
              <div className="text-xs sm:text-sm whitespace-pre-wrap break-words">{reasoning || 'No reasoning provided'}</div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
