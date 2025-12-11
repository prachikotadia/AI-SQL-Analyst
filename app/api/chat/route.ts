import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import * as XLSX from 'xlsx'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { setSessionData, getSessionData, hasSession } from '@/lib/data/inMemoryStore'
import { executeInMemoryQuery } from '@/lib/data/queryEngine'
import { nlToSqlForChat } from '@/lib/llm/nlToSql'
import { fuzzyMatchName, fuzzyMatchSQL } from '@/lib/utils/fuzzyMatch'
import { v4 as uuidv4 } from 'uuid'

// Helper to generate session ID from request
function getSessionId(request: NextRequest): string {
  // Try to get from header or cookie
  const sessionId = request.headers.get('x-session-id') || 
                    request.cookies.get('session-id')?.value
  
  if (sessionId) {
    return sessionId
  }
  
  // Generate new session ID
  return uuidv4()
}

// Parse CSV/Excel file
async function parseFile(file: File): Promise<{ data: any[]; headers: string[]; columns: Array<{ name: string; type: string }> }> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const tempPath = join(tmpdir(), `chat_upload_${Date.now()}_${file.name}`)

  try {
    await writeFile(tempPath, buffer)
    const fileExtension = file.name.toLowerCase().split('.').pop()

    let rows: any[] = []
    let headers: string[] = []

    if (fileExtension === 'csv') {
      const csvContent = readFileSync(tempPath, 'utf-8')
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, any>[]
      rows = records
      headers = records.length > 0 ? Object.keys(records[0] as Record<string, any>) : []
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false })
      rows = jsonData
      headers = rows.length > 0 ? Object.keys(rows[0]) : []
    } else {
      throw new Error('Unsupported file type')
    }

    // Infer column types
    const columns = headers.map(header => {
      const values = rows.map(row => row[header]).filter(v => v != null && v !== '')
      let type = 'text'
      
      if (values.length > 0) {
        const firstValue = values[0]
        if (typeof firstValue === 'number' || !isNaN(Number(firstValue))) {
          type = Number.isInteger(Number(firstValue)) ? 'integer' : 'decimal'
        } else if (firstValue instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(firstValue))) {
          type = 'timestamp'
        } else if (typeof firstValue === 'boolean' || /^(true|false|yes|no)$/i.test(String(firstValue))) {
          type = 'boolean'
        }
      }

      return { name: header, type }
    })

    return { data: rows, headers, columns }
  } finally {
    try {
      await unlink(tempPath)
    } catch (error) {
      // Failed to delete temp file, continue anyway
    }
  }
}

// POST handler for chat queries
export async function POST(request: NextRequest) {
  try {
    const sessionId = getSessionId(request)
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const query = formData.get('query') as string | null

    // Handle file upload
    if (file) {
      const { data, headers, columns } = await parseFile(file)
      
      if (data.length === 0) {
        return NextResponse.json({
          error: 'File is empty or has no data rows',
          why: 'The uploaded file contains no data that can be analyzed.',
        })
      }

      // Generate table name from filename
      const tableName = file.name.replace(/\.(csv|xlsx|xls)$/i, '').replace(/[^a-z0-9_]/gi, '_').toLowerCase()

      // Store in session
      setSessionData(sessionId, {
        sessionId,
        fileName: file.name,
        tableName,
        columns,
        data,
        uploadedAt: new Date(),
      })

      return NextResponse.json({
        success: true,
        message: `File "${file.name}" uploaded successfully. ${data.length} rows loaded.`,
        columns: columns.map(c => ({ name: c.name, type: c.type })),
        rowCount: data.length,
        sessionId,
      })
    }

    // Handle query
    if (!query) {
      return NextResponse.json({
        error: 'No query provided',
        why: 'Please provide either a file upload or a query question.',
      })
    }

    // Check if session has data
    const sessionData = getSessionData(sessionId)
    if (!sessionData) {
      return NextResponse.json({
        error: 'No file uploaded',
        why: 'Please upload a CSV or Excel file first so I can analyze it.',
      })
    }

    // Convert NL to SQL using chat-specific prompt
    let sql: string = 'not_available'
    let reasoning: string = 'not_available'
    let tableData: any[] | string = 'not_available'
    let chartData: any = {
      type: 'not_available',
      xField: 'not_available',
      yField: 'not_available',
      seriesField: 'not_available',
      data: 'not_available',
    }

    try {
      // Use chat-specific NL→SQL conversion with comprehensive prompt
      try {
        const llmResult = await nlToSqlForChat(
          query,
          sessionData.tableName,
          sessionData.columns,
          sessionData.data
        )
        
        sql = llmResult.response.sql || 'not_available'
        reasoning = llmResult.response.reasoning || 'not_available'
        chartData = llmResult.response.chart || {
          type: 'not_available',
          xField: 'not_available',
          yField: 'not_available',
          seriesField: 'not_available',
          data: 'not_available',
        }
        
        // Apply fuzzy matching for table and column names if SQL is available
        if (sql && sql !== 'not_available') {
          // First, ensure table name is correct
          sql = sql.replace(/FROM\s+[\w"]+/i, `FROM ${sessionData.tableName}`)
          
          // Apply fuzzy matching for table and column names
          const availableTables = [sessionData.tableName]
          const availableColumns: Record<string, string[]> = {
            [sessionData.tableName]: sessionData.columns.map(c => c.name),
          }
          
          const fuzzyResult = fuzzyMatchSQL(sql, availableTables, availableColumns)
          
          if (fuzzyResult.mappings.length > 0) {
            sql = fuzzyResult.sql
            // Add mapping explanations to reasoning
            const mappingExplanation = fuzzyResult.mappings.join('; ')
            reasoning = reasoning === 'not_available' 
              ? `Applied fuzzy matching: ${mappingExplanation}`
              : `${reasoning} [Fuzzy matching: ${mappingExplanation}]`
          }
        }
      } catch (error: any) {
        sql = 'not_available'
        const availableColumns = sessionData.columns.map(c => c.name).join(', ')
        reasoning = `not_available: Failed to generate SQL. ${error.message || 'Could not convert your question to SQL.'} Available columns: ${availableColumns}.`
      }

      // Validate SQL references only existing columns (if SQL is available)
      // Use fuzzy matching before rejecting
      if (sql && sql !== 'not_available') {
        const sqlUpper = sql.toUpperCase()
        const columnNames = sessionData.columns.map(c => c.name)
        const columnNamesLower = columnNames.map(c => c.toLowerCase())
        
        // Extract all column references from SQL
        const columnPattern = /(?:["']?(\w+)["']?\.)?["']?(\w+)["']?/gi
        const columnMatches = Array.from(sql.matchAll(columnPattern))
        const referencedColumns = new Set<string>()
        
        for (const match of columnMatches) {
          const colName = match[2]
          if (colName && !colName.match(/^(SELECT|FROM|WHERE|GROUP|ORDER|BY|LIMIT|AS|AND|OR|NOT|COUNT|SUM|AVG|MAX|MIN)$/i)) {
            referencedColumns.add(colName)
          }
        }
        
        // Try fuzzy matching for each referenced column
        let hasUnmatchableColumn = false
        const fuzzyMappings: string[] = []
        
        for (const refCol of referencedColumns) {
          const colLower = refCol.toLowerCase()
          
          // Check exact match first
          if (columnNamesLower.includes(colLower)) {
            continue // Column exists, no need to fuzzy match
          }
          
          // Try fuzzy matching
          const fuzzyResult = fuzzyMatchName(refCol, columnNames, query)
          
          if (fuzzyResult.matched) {
            // Replace in SQL
            const colPattern = new RegExp(`\\b${refCol}\\b`, 'gi')
            sql = sql.replace(colPattern, fuzzyResult.matched)
            fuzzyMappings.push(`Column "${refCol}" → "${fuzzyResult.matched}" (${fuzzyResult.reason})`)
          } else {
            // No match found even with fuzzy matching
            hasUnmatchableColumn = true
            break
          }
        }
        
        // Update reasoning with fuzzy mappings
        if (fuzzyMappings.length > 0) {
          reasoning = reasoning === 'not_available'
            ? `Applied fuzzy matching: ${fuzzyMappings.join('; ')}`
            : `${reasoning} [Fuzzy matching: ${fuzzyMappings.join('; ')}]`
        }
        
        // Only reject if fuzzy matching failed
        if (hasUnmatchableColumn) {
          sql = 'not_available'
          const availableColumns = sessionData.columns.map(c => c.name).join(', ')
          reasoning = `not_available: Could not map column references to any existing columns even after fuzzy matching. Available columns are: ${availableColumns}.`
        }
      }

      // Execute query against in-memory data (only if SQL is available)
      if (sql && sql !== 'not_available') {
        const queryResult = executeInMemoryQuery(sql, sessionData)

        if (queryResult.error) {
          sql = 'not_available'
          const availableColumns = sessionData.columns.map(c => c.name).join(', ')
          reasoning = `not_available: Query execution failed. ${queryResult.error}. Available columns: ${availableColumns}.`
          tableData = 'not_available'
          // Keep LLM's chart spec but mark data as not_available
          chartData.data = 'not_available'
        } else if (queryResult.data.length === 0) {
          // Empty result is still valid - return empty array
          tableData = []
          reasoning = reasoning === 'not_available' 
            ? 'Query executed successfully but returned no results.' 
            : reasoning
          // Keep LLM's chart spec but use empty data
          chartData.data = []
        } else {
          tableData = queryResult.data.slice(0, 50) // Max 50 rows for preview
          
          // Use LLM's chart specification, but populate data from query results
          // If chart type is KPI/single_value, use first row only
          let chartDataRows = queryResult.data.slice(0, 50) // Limit to 50 rows for chart
          
          if (chartData.type === 'single_value' || chartData.type === 'kpi') {
            chartDataRows = queryResult.data.slice(0, 1)
          }
          
          // Update chart data with actual query results
          chartData.data = chartDataRows.length > 0 ? chartDataRows : 'not_available'
          
          // If LLM didn't specify chart fields, use first columns as fallback
          if (chartData.xField === 'not_available' && queryResult.columns.length > 0) {
            chartData.xField = queryResult.columns[0]
          }
          if (chartData.yField === 'not_available' && queryResult.columns.length > 1) {
            chartData.yField = queryResult.columns[1]
          }
        }
      } else {
        // SQL is not available - set all to not_available
        // Keep LLM's chart structure but mark everything as not_available
        tableData = 'not_available'
        if (chartData.data !== 'not_available') {
          chartData.data = 'not_available'
        }
      }
    } catch (error: any) {
      sql = 'not_available'
      const availableColumns = sessionData.columns.map(c => c.name).join(', ')
      reasoning = `not_available: An error occurred while processing your query. ${error.message || 'Failed to process your request.'} Available columns: ${availableColumns}.`
      tableData = 'not_available'
      // Ensure chart data is properly set
      if (!chartData || chartData.type === undefined) {
        chartData = {
          type: 'not_available',
          xField: 'not_available',
          yField: 'not_available',
          seriesField: 'not_available',
          data: 'not_available',
        }
      } else {
        chartData.data = 'not_available'
      }
    }

    // Build response with strict format - ALL fields must be present
    const response = {
      sql: sql || 'not_available',
      reasoning: reasoning || 'not_available',
      table: tableData,
      chart: {
        type: chartData.type || 'not_available',
        xField: chartData.xField || 'not_available',
        yField: chartData.yField || 'not_available',
        seriesField: chartData.seriesField || 'not_available',
        data: chartData.data || 'not_available',
      },
    }

    return NextResponse.json(response)
  } catch (error: any) {
    return NextResponse.json({
      error: 'An error occurred',
      why: error.message || 'Failed to process your request.',
    })
  }
}

// GET handler to check session status
export async function GET(request: NextRequest) {
  const sessionId = getSessionId(request)
  const sessionData = getSessionData(sessionId)

  if (!sessionData) {
    return NextResponse.json({
      hasFile: false,
      message: 'No file uploaded. Please upload a CSV or Excel file.',
    })
  }

  return NextResponse.json({
    hasFile: true,
    fileName: sessionData.fileName,
    tableName: sessionData.tableName,
    columns: sessionData.columns.map(c => ({ name: c.name, type: c.type })),
    rowCount: sessionData.data.length,
    uploadedAt: sessionData.uploadedAt.toISOString(),
  })
}

