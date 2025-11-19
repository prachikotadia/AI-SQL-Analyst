import { NextRequest, NextResponse } from 'next/server'
import { QueryRequestSchema, QueryResponseSchema, type QueryResponse } from '@/types'
import { nlToSql } from '@/lib/llm/nlToSql'
import { validateSql } from '@/lib/sql/validator'
import { sanitizeSql } from '@/lib/sql/sqlUtils'
import { executeSql } from '@/lib/sql/executor'
import { getCached, setCached, refreshCacheIfStale } from '@/lib/ml/cache'
import { logEvaluation } from '@/lib/ml/eval'
import { getMetricByName } from '@/lib/ml/metrics'
import { generateChartSpec } from '@/lib/llm/chartGenerator'
import { classifyQuery } from '@/lib/ml/classifier'
import { getDefaultChartSpec } from '@/lib/chart/mapper'
import { getFilesByIds, type FileMetadata } from '@/lib/data/fileRegistry'
import { executeMultiFileQuery } from '@/lib/data/multiFileQueryEngine'
import { buildPromptFromFiles } from '@/lib/llm/promptFromFiles'
import { getChat, getChatFiles, addFileToChat, addMessageToChat, createChat } from '@/lib/data/chatStore'
import OpenAI from 'openai'
import { repairJson } from '@/lib/llm/jsonRepair'
import type { LLMResponse } from '@/types'
import { validateSqlAgainstSchema } from '@/lib/sql/schemaValidator'
import { generateChartFromResult } from '@/lib/chart/resultBasedChart'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let query = ''

  try {
    // Validate request with Zod
    const body = await request.json()
    const validationResult = QueryRequestSchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: '',
          preview_sql: null,
          action_sql: null,
          sql: '',
          chartSpec: getDefaultChartSpec([]),
          error: {
            message: validationResult.error.errors[0]?.message || 'Invalid request',
            type: 'validation' as const,
          },
        },
        { status: 400 }
      )
    }

    const { query: validatedQuery, timeRange, fileIds = [], chatId } = validationResult.data
    query = validatedQuery

    // Get files from chat if chatId provided, otherwise use fileIds from request
    let finalFileIds: string[] = []
    let attachedFiles: FileMetadata[] = []

    if (chatId) {
      // Get or create chat (never return 404)
      let chat = getChat(chatId)
      if (!chat) {
        // Create chat if it doesn't exist
        createChat(chatId.startsWith('chat_') ? chatId : undefined)
        chat = getChat(chatId)
        if (!chat) {
          const newChatId = createChat()
          chat = getChat(newChatId)
        }
      }
      
      if (chat) {
        // Get files from chat
        const chatFiles = getChatFiles(chat.chatId)
        finalFileIds = chatFiles.map((f: FileMetadata) => f.id)
        
        // Add any new files from request to chat
        if (fileIds && fileIds.length > 0) {
          const newFiles = getFilesByIds(fileIds)
          for (const file of newFiles) {
            if (file) {
              addFileToChat(chat.chatId, file)
              if (!finalFileIds.includes(file.id)) {
                finalFileIds.push(file.id)
              }
            }
          }
        }
        
        attachedFiles = getFilesByIds(finalFileIds)
      } else {
        // Fallback: use fileIds from request
        finalFileIds = fileIds || []
        attachedFiles = getFilesByIds(finalFileIds)
      }
    } else {
      // No chatId, use fileIds from request
      finalFileIds = fileIds || []
      attachedFiles = getFilesByIds(finalFileIds)
    }

    if (attachedFiles.length === 0) {
      // Return 200 with error object (soft error, not a server failure)
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: 'This query requires attached CSV/Excel files. Please attach files to your query.',
          preview_sql: null,
          action_sql: null,
          sql: '',
          chartSpec: getDefaultChartSpec([]),
          error: {
            message: 'No files attached to this chat. Attach a CSV or Excel file and try again.',
            type: 'no_files' as const,
          },
        },
        { status: 200 }
      )
    }

    // Check cache first, but refresh if stale (older than 1 hour)
    const cacheKey = `${query}:${finalFileIds.sort().join(',')}`
    refreshCacheIfStale(cacheKey)
    const cached = getCached(cacheKey)
    let llmResult

    if (cached) {
      llmResult = {
        response: {
          preview_sql: cached.sql,
          action_sql: null,
          reasoning: cached.reasoning,
          chart: cached.chartSpec,
          metric_name: cached.metricName,
          query_category: undefined,
          sql: cached.sql, // Legacy
        },
        tokensUsed: undefined,
      }
    } else {
      // Generate SQL from LLM using attached files
      const prompt = buildPromptFromFiles(query, finalFileIds, timeRange)
      
      // Use OpenRouter by default, fallback to LM Studio
      const baseURL = process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1'
      const apiKey = process.env.OPENAI_API_KEY || 'lm-studio'
      const isLMStudio = baseURL.includes('localhost') || baseURL.includes('127.0.0.1') || baseURL.includes('1234')
      
      // Log API configuration (without exposing full key)
      console.log('LLM API Config:', {
        baseURL: baseURL.includes('openrouter') ? 'OpenRouter' : baseURL,
        hasApiKey: !!apiKey && apiKey !== 'lm-studio',
        keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'none',
        model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
      })
      
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: baseURL,
      })
      
      const requestOptions: any = {
        model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a SQL expert. Always respond with valid JSON only, no markdown, no code blocks, no explanations outside the JSON. Your response must be a valid JSON object. Make sure to close all JSON objects and strings properly.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 3000,
      }
      
      // OpenRouter and OpenAI support JSON mode
      if (!isLMStudio) {
        requestOptions.response_format = { type: 'json_object' }
      }
      
      let completion
      try {
        completion = await openai.chat.completions.create(requestOptions)
      } catch (llmError: any) {
        console.error('LLM API Error:', {
          message: llmError.message,
          status: llmError.status,
          response: llmError.response,
        })
        throw new Error(`LLM API error: ${llmError.message || 'Failed to generate response'}`)
      }
      
      const content = completion.choices[0]?.message?.content

      if (!content) {
        throw new Error('Empty response from LLM')
      }

      let parsed: any
      try {
        parsed = JSON.parse(content)
      } catch (parseError: any) {
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[1])
          } catch {
            const repaired = repairJson(jsonMatch[1])
            if (repaired) {
              parsed = JSON.parse(repaired)
            } else {
              throw new Error('Invalid JSON response from LLM')
            }
          }
        } else {
          const repaired = repairJson(content)
          if (repaired) {
            parsed = JSON.parse(repaired)
          } else {
            throw new Error('Invalid JSON response from LLM')
          }
        }
      }

      // Validate required fields (new format: sql, reasoning, table, chart)
      if (!parsed.sql) {
        throw new Error('Missing required field: sql')
      }
      if (!parsed.reasoning) {
        parsed.reasoning = 'No reasoning provided'
      }
      // table and chart are optional - will use LLM's if provided, otherwise generate from results

      // Validate SQL against schema
      const schemaValidation = validateSqlAgainstSchema(parsed.sql, finalFileIds)
      
      if (!schemaValidation.valid) {
        // One retry with error message
        console.warn('SQL validation failed, retrying with error message:', schemaValidation.error)
        
        const retryPrompt = buildPromptFromFiles(
          `The previous SQL query failed validation: ${schemaValidation.error}. Fix it using only the tables and columns from the schema. Original question: ${query}`,
          finalFileIds,
          timeRange
        )
        
        const retryCompletion = await openai.chat.completions.create({
          ...requestOptions,
          messages: [
            {
              role: 'system',
              content: 'You are a SQL expert. Always respond with valid JSON only, no markdown, no code blocks.',
            },
            {
              role: 'user',
              content: retryPrompt,
            },
          ],
        })
        
        const retryContent = retryCompletion.choices[0]?.message?.content
        if (retryContent) {
          try {
            const retryParsed = JSON.parse(retryContent)
            if (retryParsed.sql) {
              parsed.sql = retryParsed.sql
              if (retryParsed.reasoning) {
                parsed.reasoning = retryParsed.reasoning
              }
              // Re-validate
              const retryValidation = validateSqlAgainstSchema(parsed.sql, finalFileIds)
              if (!retryValidation.valid) {
                throw new Error(`SQL still invalid after retry: ${retryValidation.error}`)
              }
            }
          } catch (retryError) {
            throw new Error(`Failed to fix SQL: ${schemaValidation.error}`)
          }
        } else {
          throw new Error(`SQL validation failed: ${schemaValidation.error}`)
        }
      }

      // Convert to LLMResponse format
      // Handle chart from LLM response (if provided)
      let chartSpec = getDefaultChartSpec([])
      if (parsed.chart && typeof parsed.chart === 'object') {
        chartSpec = {
          type: parsed.chart.type || null,
          xField: parsed.chart.xField || null,
          yField: parsed.chart.yField || null,
          seriesField: parsed.chart.seriesField || null,
          aggregation: parsed.chart.aggregation || null,
        }
      }

      const llmResponse: LLMResponse = {
        preview_sql: parsed.sql,
        action_sql: null,
        reasoning: parsed.reasoning,
        chart: chartSpec,
        sql: parsed.sql,
      }

      llmResult = {
        response: llmResponse,
        tokensUsed: completion.usage?.total_tokens,
      } as any
      
      // Store LLM's table and chart data for potential use (accessible after execution)
      ;(llmResult as any).llmTableData = parsed.table && parsed.table !== 'not_available' ? parsed.table : null
      ;(llmResult as any).llmChartData = parsed.chart?.data && parsed.chart.data !== 'not_available' ? parsed.chart.data : null

      // Cache the result
      setCached(cacheKey, {
        sql: llmResult.response.preview_sql || llmResult.response.sql || '',
        reasoning: llmResult.response.reasoning,
        chartSpec: llmResult.response.chart,
        metricName: llmResult.response.metric_name,
      })
    }

    const llmResponse = llmResult.response

    // Determine which SQL to validate and execute
    // New format: sql (always SELECT) - maps to preview_sql
    // Old format: preview_sql (always SELECT) and action_sql (optional DML/DDL)
    // Handle both formats
    const sqlToValidate = llmResponse.sql || llmResponse.preview_sql || ''
    let actionSql = llmResponse.action_sql
    
    // If LLM returned "sql" field, use it as preview_sql
    if (llmResponse.sql && !llmResponse.preview_sql) {
      llmResponse.preview_sql = llmResponse.sql
    }

    // Enforce rule: For read queries, action_sql must be "not_available"
    // Detect read intent from query text (show, list, count, how many, etc.)
    const queryLower = query.toLowerCase()
    const readKeywords = ['show', 'list', 'count', 'how many', 'what are', 'find', 'get', 'display', 'select', 'filter', 'aggregate']
    const writeKeywords = ['insert', 'update', 'delete', 'create', 'alter', 'drop', 'add', 'remove', 'modify']
    
    const isReadQuery = readKeywords.some(kw => queryLower.includes(kw)) && 
                       !writeKeywords.some(kw => queryLower.includes(kw))
    
    // If it's clearly a read query but action_sql is set, force it to "not_available"
    if (isReadQuery && actionSql && actionSql !== 'not_available' && actionSql !== null) {
      // Log this as it shouldn't happen with the new prompt
      console.warn(`Read query "${query}" had action_sql set to "${actionSql}". Forcing to "not_available".`)
      actionSql = 'not_available'
      llmResponse.action_sql = 'not_available'
    }

    // Validate preview SQL (must be SELECT)
    if (!sqlToValidate) {
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: llmResponse.reasoning,
          preview_sql: null,
          action_sql: actionSql,
          chartSpec: llmResponse.chart,
          error: {
            message: 'No preview SQL generated',
            type: 'validation' as const,
          },
        },
        { status: 400 }
      )
    }

    let validation = await validateSql(sqlToValidate)
    let finalSqlToValidate = sqlToValidate
    
    // Use corrected SQL if validator fixed table names (e.g., "cities" -> "cities_123456")
    if (validation.correctedSql) {
      finalSqlToValidate = validation.correctedSql
      llmResponse.preview_sql = validation.correctedSql
    }
    
    if (!validation.valid) {
      // Try to fix once with repair prompt
      const repairResult = await nlToSql({
        query: `The previous SQL query failed validation: ${validation.error}. Please generate a corrected SQL query for: ${query}`,
        timeRange,
        retryOnError: false,
      })

      if (repairResult.error || (!repairResult.response.preview_sql && !repairResult.response.sql)) {
        const latency = Date.now() - startTime
        logEvaluation({
          query,
          sql: sqlToValidate,
          success: false,
          errorType: 'validation',
          latencyMs: latency,
          rowCount: 0,
          tokensUsed: llmResult.tokensUsed,
        })

        return NextResponse.json(
          {
            data: [],
            columns: [],
            reasoning: `Validation failed: ${validation.error}. The generated SQL query was not safe to execute.`,
            preview_sql: sqlToValidate,
            action_sql: actionSql,
            chartSpec: llmResponse.chart,
            error: {
              message: validation.error || 'SQL validation failed',
              type: 'validation' as const,
            },
          },
          { status: 400 }
        )
      }

      // Re-validate repaired SQL
      const repairedPreview = repairResult.response.preview_sql || repairResult.response.sql || ''
      const repairValidation = await validateSql(repairedPreview)
      if (!repairValidation.valid) {
        const latency = Date.now() - startTime
        logEvaluation({
          query,
          sql: repairedPreview,
          success: false,
          errorType: 'validation',
          latencyMs: latency,
          rowCount: 0,
        })

        return NextResponse.json(
          {
            data: [],
            columns: [],
            reasoning: `Validation failed after repair attempt: ${repairValidation.error}`,
            preview_sql: repairedPreview,
            action_sql: repairResult.response.action_sql || actionSql,
            chartSpec: repairResult.response.chart || llmResponse.chart,
            error: {
              message: repairValidation.error || 'SQL validation failed',
              type: 'validation' as const,
            },
          },
          { status: 400 }
        )
      }

      // Use repaired response
      llmResponse.preview_sql = repairedPreview
      llmResponse.action_sql = repairResult.response.action_sql || actionSql
      if (repairResult.response.chart) {
        llmResponse.chart = repairResult.response.chart
      }
    }

    // Validate action_sql if present (for DML/DDL)
    // Skip if it's "not_available" (which is correct for read queries)
    if (actionSql && actionSql !== 'not_available' && actionSql !== null) {
      const actionValidation = await validateSql(actionSql)
      if (!actionValidation.valid) {
        llmResponse.action_sql = null
      } else {
        // Execute action_sql for DML/DDL operations (CREATE, INSERT, UPDATE, DELETE, etc.)
        try {
          const actionResult = await executeSql(actionSql)
          // For CREATE TABLE and other DDL, we don't need to return data
          // But we log success
          if (actionResult.error) {
            // If action fails, still show preview but note the error
            llmResponse.reasoning = `${llmResponse.reasoning || ''} Action SQL execution failed: ${actionResult.error}`
          }
        } catch (actionError: any) {
          llmResponse.reasoning = `${llmResponse.reasoning || ''} Action SQL execution error: ${actionError.message}`
        }
      }
    }

    const sqlToExecute = sanitizeSql(llmResponse.preview_sql || finalSqlToValidate)
    
    // Execute against attached files (in-memory) instead of database
    const executionResult = executeMultiFileQuery(sqlToExecute, finalFileIds)
    
    if (executionResult.error) {
      const latency = Date.now() - startTime
      logEvaluation({
        query,
        sql: sqlToExecute,
        success: false,
        errorType: 'execution',
        latencyMs: latency,
        rowCount: 0,
        tokensUsed: llmResult.tokensUsed,
      })

      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: llmResponse.reasoning || `Query execution failed: ${executionResult.error}`,
          preview_sql: llmResponse.preview_sql || sqlToExecute,
          action_sql: llmResponse.action_sql || null,
          sql: sqlToExecute, // Legacy
          chartSpec: llmResponse.chart || getDefaultChartSpec([]),
          error: {
            message: executionResult.error,
            type: 'execution' as const,
          },
        },
        { status: 500 }
      )
    }

    // Use LLM's chart if provided and valid, otherwise generate from results
    let chartResult: { chartSpec: any; chartData: any[] }
    const llmChartData = (llmResult as any).llmChartData
    const llmTableData = (llmResult as any).llmTableData
    
    if (llmResponse.chart && llmResponse.chart.type && llmResponse.chart.type !== 'not_available' && 
        llmResponse.chart.xField && llmResponse.chart.yField) {
      // Use LLM's chart specification
      chartResult = {
        chartSpec: llmResponse.chart,
        chartData: llmChartData || [],
      }
    } else {
      // Generate chart from result shape (backend fallback)
      chartResult = generateChartFromResult(
        executionResult.data,
        executionResult.columns,
        query,
        attachedFiles.reduce((sum, f) => sum + f.data.length, 0) // total row count
      )
    }
    
    // Use LLM's table data if provided and valid, otherwise use execution results
    const data = llmTableData && Array.isArray(llmTableData) && llmTableData.length > 0
      ? llmTableData.slice(0, 50) // Limit to 50 rows
      : executionResult.data

    // Get metric info if available
    let metricsInfo
    if (llmResponse.metric_name) {
      const metric = getMetricByName(llmResponse.metric_name)
      if (metric) {
        metricsInfo = {
          name: metric.name,
          displayName: metric.displayName,
          description: metric.description,
        }
      }
    }

    const latency = Date.now() - startTime
    logEvaluation({
      query,
      sql: sqlToExecute,
      success: true,
      latencyMs: latency,
      rowCount: executionResult.data.length,
      tokensUsed: llmResult.tokensUsed,
    })

    // Ensure action_sql is properly formatted (null for "not_available" or actual SQL)
    const finalActionSql = (actionSql === 'not_available' || !actionSql) ? null : actionSql

    const response: QueryResponse = {
      data,
      columns: executionResult.columns,
      reasoning: llmResponse.reasoning,
      preview_sql: llmResponse.preview_sql || sqlToExecute,
      action_sql: finalActionSql,
      sql: sqlToExecute, // Legacy field for backward compatibility
      chartSpec: chartResult.chartSpec, // Generated from results, not LLM
      metricsInfo,
      queryCategory: llmResponse.query_category,
      error: null,
    }

    const responseValidation = QueryResponseSchema.safeParse(response)
    if (!responseValidation.success) {
      // Log validation errors in production
    }

    // Save message to chat if chatId provided
    if (chatId) {
      addMessageToChat(chatId, query, response)
    }

    return NextResponse.json(response)
  } catch (error: any) {
    const latency = Date.now() - startTime
    
    // Log error details for debugging
    console.error('Query API Error:', {
      message: error.message,
      stack: error.stack,
      query: query || 'unknown',
      latencyMs: latency,
    })
    
    logEvaluation({
      query: query || 'unknown',
      sql: '',
      success: false,
      errorType: 'unknown',
      latencyMs: latency,
      rowCount: 0,
    })

    const errorResponse: QueryResponse = {
      data: [],
      columns: [],
      reasoning: `An unexpected error occurred: ${error.message || 'Unknown error'}. Please check the server logs for details.`,
      preview_sql: null,
      action_sql: null,
      sql: '', // Legacy
      chartSpec: getDefaultChartSpec([]),
      error: {
        message: error.message || 'An unexpected error occurred',
        type: 'unknown' as const,
      },
    }
    return NextResponse.json(errorResponse, { status: 500 })
  }
}
