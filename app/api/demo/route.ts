import { NextRequest, NextResponse } from 'next/server'
import { getDemoQueryByQuery, type DemoQuery } from '@/lib/utils/demoQueries'
import { executeMultiFileQuery } from '@/lib/data/multiFileQueryEngine'
import { getFilesByIds } from '@/lib/data/fileRegistry'
import { generateChartFromResult } from '@/lib/chart/resultBasedChart'
import type { QueryResponse } from '@/types'

/**
 * Demo API endpoint that works without OpenAI API key
 * Executes predefined queries with their SQL directly
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { query, fileIds = [] } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: 'Query is required',
          preview_sql: null,
          action_sql: null,
          sql: '',
          chartSpec: { type: 'table', xField: null, yField: null },
          error: {
            message: 'Query is required',
            type: 'validation' as const,
          },
        },
        { status: 400 }
      )
    }

    // Find matching demo query (case-insensitive partial match)
    let demoQuery = getDemoQueryByQuery(query.trim())
    
    // If exact match not found, try partial match
    if (!demoQuery) {
      const { DEMO_QUERIES } = await import('@/lib/utils/demoQueries')
      const lowerQuery = query.trim().toLowerCase()
      demoQuery = DEMO_QUERIES.find(q => 
        lowerQuery.includes(q.query.toLowerCase()) || 
        q.query.toLowerCase().includes(lowerQuery)
      )
    }

    if (!demoQuery) {
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: 'This query is not available in demo mode. Please use one of the sample queries from the demo section.',
          preview_sql: null,
          action_sql: null,
          sql: '',
          chartSpec: { type: 'table', xField: null, yField: null },
          error: {
            message: 'Query not found in demo queries. Please click on one of the demo query cards.',
            type: 'validation' as const,
          },
        },
        { status: 200 }
      )
    }

    // Check if files are attached
    if (fileIds.length === 0) {
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: 'Please attach the sample data file to run demo queries.',
          preview_sql: null,
          action_sql: null,
          sql: '',
          chartSpec: { type: 'table', xField: null, yField: null },
          error: {
            message: 'No files attached. Please upload the sample-data.csv file.',
            type: 'no_files' as const,
          },
        },
        { status: 200 }
      )
    }

    // Get files
    const files = getFilesByIds(fileIds)
    if (files.length === 0) {
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: 'Files not found. Please upload the sample data file.',
          preview_sql: null,
          action_sql: null,
          sql: '',
          chartSpec: { type: 'table', xField: null, yField: null },
          error: {
            message: 'Files not found',
            type: 'no_files' as const,
          },
        },
        { status: 200 }
      )
    }

    // Replace table name in SQL with actual table name from file
    const firstFile = files[0]
    if (!firstFile) {
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: 'File not found',
          preview_sql: null,
          action_sql: null,
          sql: '',
          chartSpec: { type: 'table', xField: null, yField: null },
          error: {
            message: 'File not found',
            type: 'no_files' as const,
          },
        },
        { status: 200 }
      )
    }

    // Replace placeholder table name with actual table name
    const actualSql = demoQuery.sql.replace(/FROM\s+sample_data/i, `FROM ${firstFile.tableName}`)

    // Execute SQL query directly
    const queryResult = executeMultiFileQuery(actualSql, fileIds)

    if (queryResult.error) {
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: `Query execution failed: ${queryResult.error}`,
          preview_sql: actualSql,
          action_sql: null,
          sql: actualSql,
          chartSpec: { type: 'table', xField: null, yField: null },
          error: {
            message: queryResult.error,
            type: 'execution' as const,
          },
        },
        { status: 200 }
      )
    }

    // Generate chart specification
    // Convert column names to ColumnMetadata format
    const columns = queryResult.columns.map(name => {
      // Try to find column type from file metadata
      const col = firstFile.columns.find(c => c.name.toLowerCase() === name.toLowerCase())
      return {
        name,
        type: col?.type || 'text',
      }
    })
    
    const chartResult = generateChartFromResult(
      queryResult.data,
      columns,
      query, // query parameter (required)
      queryResult.data.length // totalCount (optional)
    )

    // Use demo query's chart spec if available, otherwise use generated
    const chartSpec = demoQuery.chartType
      ? {
          type: demoQuery.chartType,
          xField: demoQuery.xField,
          yField: demoQuery.yField,
        }
      : chartResult.chartSpec

    const executionTime = Date.now() - startTime

    const response: QueryResponse = {
      data: queryResult.data,
      columns: columns,
      reasoning: demoQuery.reasoning,
      preview_sql: actualSql,
      action_sql: null,
      sql: actualSql,
      chartSpec,
      performanceMetrics: {
        executionTimeMs: executionTime,
        tokenUsage: 0, // No tokens used in demo mode
        queryComplexity: 3,
        sqlLength: actualSql.length,
      },
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return NextResponse.json(
      {
        data: [],
        columns: [],
        reasoning: `Demo query execution failed: ${errorMessage}`,
        preview_sql: null,
        action_sql: null,
        sql: '',
        chartSpec: { type: 'table', xField: null, yField: null },
        error: {
          message: errorMessage,
          type: 'unknown' as const,
        },
      },
      { status: 500 }
    )
  }
}
