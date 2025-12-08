import { NextRequest, NextResponse } from 'next/server'
import { QueryRequestSchema, QueryResponseSchema, type QueryResponse } from '@/types'
import { nlToSql } from '@/lib/llm/nlToSql'
import { validateSql } from '@/lib/sql/validator'
import { sanitizeSql } from '@/lib/sql/sqlUtils'
import { executeSql } from '@/lib/sql/executor'
import { getCached, setCached, refreshCacheIfStale } from '@/lib/ml/cache'
import { logEvaluation } from '@/lib/ml/eval'
import { getMetricByName } from '@/lib/ml/metrics'
import { getDefaultChartSpec } from '@/lib/chart/mapper'
import { getFilesByIds, type FileMetadata } from '@/lib/data/fileRegistry'
import { executeMultiFileQuery } from '@/lib/data/multiFileQueryEngine'
import { buildPromptFromFiles } from '@/lib/llm/promptFromFiles'
import { getChat, getChatFiles } from '@/lib/data/chatStore'
import OpenAI from 'openai'
import { repairJson } from '@/lib/llm/jsonRepair'
import type { LLMResponse } from '@/types'
import { validateSqlAgainstSchema } from '@/lib/sql/schemaValidator'
import { generateChartFromResult } from '@/lib/chart/resultBasedChart'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let query = ''

  try {
    let body
    try {
      body = await request.json()
    } catch (parseError: any) {
      console.error('Failed to parse request body:', parseError.message)
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: 'Invalid request body. Expected JSON.',
          preview_sql: null,
          action_sql: null,
          sql: '',
          chartSpec: { type: null, xField: null, yField: null },
          error: {
            message: 'Invalid request body',
            type: 'validation' as const,
          },
        },
        { status: 400 }
      )
    }
    
    const validationResult = QueryRequestSchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: `Invalid request: ${validationResult.error.errors[0]?.message || 'Request validation failed'}`,
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
      const chat = getChat(chatId)
      if (chat) {
        const chatFiles = getChatFiles(chat.chatId)
        finalFileIds = chatFiles.map((f: FileMetadata) => f.id)
        
        // Add any new files from request
        if (fileIds && fileIds.length > 0) {
          const newFiles = getFilesByIds(fileIds)
          for (const file of newFiles) {
            if (file && !finalFileIds.includes(file.id)) {
              finalFileIds.push(file.id)
            }
          }
        }
        
        attachedFiles = getFilesByIds(finalFileIds)
      } else {
        finalFileIds = fileIds || []
        attachedFiles = getFilesByIds(finalFileIds)
      }
    } else {
      finalFileIds = fileIds || []
      attachedFiles = getFilesByIds(finalFileIds)
    }

    if (attachedFiles.length === 0) {
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

    // Check cache first
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
          sql: cached.sql,
        },
        tokensUsed: undefined,
      }
    } else {
      let prompt
      try {
        prompt = buildPromptFromFiles(query, finalFileIds, timeRange)
        if (!prompt || prompt.trim().length === 0) {
          throw new Error('Generated prompt is empty')
        }
      } catch (promptError: any) {
        console.error('Failed to build prompt:', {
          message: promptError.message,
          stack: promptError.stack,
          query,
          fileIds: finalFileIds,
        })
        throw new Error(`Failed to build prompt: ${promptError.message}`)
      }
      
      let baseURL = process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1'
      const apiKey = process.env.OPENAI_API_KEY || 'lm-studio'
      
      // Fix incorrect base URLs
      if (baseURL.includes('platform.openai.com')) {
        if (apiKey && apiKey.startsWith('sk-')) {
          baseURL = 'https://api.openai.com/v1'
        } else {
          baseURL = 'https://openrouter.ai/api/v1'
        }
      }
      
      const isLMStudio = baseURL.includes('localhost') || baseURL.includes('127.0.0.1') || baseURL.includes('1234')
      const isOpenAI = baseURL.includes('api.openai.com')
      
      if (!isLMStudio && (!apiKey || apiKey === 'lm-studio')) {
        throw new Error('OpenRouter API key is required. Please set OPENAI_API_KEY environment variable.')
      }
      
      let modelName = process.env.OPENAI_MODEL || 'openai/gpt-4o-mini'
      if (isOpenAI) {
        if (modelName.startsWith('openai/')) {
          modelName = modelName.replace('openai/', '')
        }
        if (!process.env.OPENAI_MODEL) {
          modelName = 'gpt-4o-mini'
        }
      }
      
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: baseURL,
      })
      
      const requestOptions: any = {
        model: modelName,
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
          statusText: llmError.statusText,
          response: llmError.response,
          code: llmError.code,
          cause: llmError.cause,
        })
        
        if (llmError.status === 401) {
          throw new Error('Invalid API key. Please check your OPENAI_API_KEY environment variable.')
        } else if (llmError.status === 403) {
          throw new Error('API access forbidden. Please check your OPENAI_API_KEY and ensure it has the correct permissions.')
        } else if (llmError.status === 429) {
          const waitTimeMatch = llmError.message?.match(/try again in ([\dhm.]+)/i)
          const waitTime = waitTimeMatch ? waitTimeMatch[1] : 'a few minutes'
          const rateLimitMessage = llmError.message?.includes('TPM') || llmError.message?.includes('tokens per min')
            ? `Rate limit exceeded (tokens per minute). Please try again in ${waitTime} or add a payment method to increase your limits.`
            : `Rate limit exceeded. Please try again in ${waitTime} or upgrade your API plan.`
          throw new Error(rateLimitMessage)
        } else if (llmError.status === 500) {
          throw new Error('LLM service error. Please try again or check your API configuration.')
        } else if (llmError.code === 'ECONNREFUSED' || llmError.message?.includes('ECONNREFUSED')) {
          throw new Error('Cannot connect to LLM service. Please check if LM Studio is running or your API endpoint is correct.')
        }
        
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

      if (!parsed.sql) {
        throw new Error('Missing required field: sql')
      }
      if (!parsed.reasoning) {
        parsed.reasoning = 'No reasoning provided'
      }

      const schemaValidation = validateSqlAgainstSchema(parsed.sql, finalFileIds)
      
      if (!schemaValidation.valid) {
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
      
      ;(llmResult as any).llmTableData = parsed.table && parsed.table !== 'not_available' ? parsed.table : null
      ;(llmResult as any).llmChartData = parsed.chart?.data && parsed.chart.data !== 'not_available' ? parsed.chart.data : null

      setCached(cacheKey, {
        sql: llmResult.response.preview_sql || llmResult.response.sql || '',
        reasoning: llmResult.response.reasoning,
        chartSpec: llmResult.response.chart,
        metricName: llmResult.response.metric_name,
      })
    }

    const llmResponse = llmResult.response

    const sqlToValidate = llmResponse.sql || llmResponse.preview_sql || ''
    let actionSql = llmResponse.action_sql
    
    if (llmResponse.sql && !llmResponse.preview_sql) {
      llmResponse.preview_sql = llmResponse.sql
    }

    // Enforce read queries don't have action_sql
    const queryLower = query.toLowerCase()
    const readKeywords = ['show', 'list', 'count', 'how many', 'what are', 'find', 'get', 'display', 'select', 'filter', 'aggregate']
    const writeKeywords = ['insert', 'update', 'delete', 'create', 'alter', 'drop', 'add', 'remove', 'modify']
    
    const isReadQuery = readKeywords.some(kw => queryLower.includes(kw)) && 
                       !writeKeywords.some(kw => queryLower.includes(kw))
    
    if (isReadQuery && actionSql && actionSql !== 'not_available' && actionSql !== null) {
      console.warn(`Read query "${query}" had action_sql set to "${actionSql}". Forcing to "not_available".`)
      actionSql = 'not_available'
      llmResponse.action_sql = 'not_available'
    }

    if (!sqlToValidate) {
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: llmResponse.reasoning || 'No reasoning available.',
          preview_sql: null,
          action_sql: actionSql,
          sql: '', // Legacy
          chartSpec: llmResponse.chart || getDefaultChartSpec([]),
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
    
    if (validation.correctedSql) {
      finalSqlToValidate = validation.correctedSql
      llmResponse.preview_sql = validation.correctedSql
    }
    
    if (!validation.valid) {
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
            sql: sqlToValidate, // Legacy
            chartSpec: llmResponse.chart || getDefaultChartSpec([]),
            error: {
              message: validation.error || 'SQL validation failed',
              type: 'validation' as const,
            },
          },
          { status: 400 }
        )
      }

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
            sql: repairedPreview, // Legacy
            chartSpec: repairResult.response.chart || llmResponse.chart || getDefaultChartSpec([]),
            error: {
              message: repairValidation.error || 'SQL validation failed',
              type: 'validation' as const,
            },
          },
          { status: 400 }
        )
      }

      llmResponse.preview_sql = repairedPreview
      llmResponse.action_sql = repairResult.response.action_sql || actionSql
      if (repairResult.response.chart) {
        llmResponse.chart = repairResult.response.chart
      }
    }

    // Validate and execute action_sql if present (for DML/DDL)
    if (actionSql && actionSql !== 'not_available' && actionSql !== null) {
      const actionValidation = await validateSql(actionSql)
      if (!actionValidation.valid) {
        llmResponse.action_sql = null
      } else {
        try {
          const actionResult = await executeSql(actionSql)
          if (actionResult.error) {
            llmResponse.reasoning = `${llmResponse.reasoning || ''} Action SQL execution failed: ${actionResult.error}`
          }
        } catch (actionError: any) {
          llmResponse.reasoning = `${llmResponse.reasoning || ''} Action SQL execution error: ${actionError.message}`
        }
      }
    }

    const sqlToExecute = sanitizeSql(llmResponse.preview_sql || finalSqlToValidate)
    
    let executionResult
    try {
      executionResult = executeMultiFileQuery(sqlToExecute, finalFileIds)
    } catch (execError: any) {
      console.error('Query execution error:', execError.message, execError.stack)
      throw new Error(`Query execution failed: ${execError.message}`)
    }
    
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

    // Use LLM's chart if provided, otherwise generate from results
    let chartResult: { chartSpec: any; chartData: any[] }
    const llmChartData = (llmResult as any).llmChartData
    const llmTableData = (llmResult as any).llmTableData
    
    if (llmResponse.chart && llmResponse.chart.type && llmResponse.chart.type !== 'not_available' && 
        llmResponse.chart.xField && llmResponse.chart.yField) {
      chartResult = {
        chartSpec: llmResponse.chart,
        chartData: llmChartData || [],
      }
    } else {
      try {
        chartResult = generateChartFromResult(
          executionResult.data,
          executionResult.columns,
          query,
          attachedFiles.reduce((sum, f) => sum + (f.data?.length || 0), 0)
        )
      } catch (chartError: any) {
        console.error('Chart generation error:', chartError.message)
        chartResult = {
          chartSpec: { type: 'table', xField: null, yField: null },
          chartData: executionResult.data,
        }
      }
    }
    
    const data = llmTableData && Array.isArray(llmTableData) && llmTableData.length > 0
      ? llmTableData.slice(0, 50)
      : executionResult.data

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

    const finalActionSql = (actionSql === 'not_available' || !actionSql) ? null : actionSql

    const response: QueryResponse = {
      data,
      columns: executionResult.columns,
      reasoning: llmResponse.reasoning,
      preview_sql: llmResponse.preview_sql || sqlToExecute,
      action_sql: finalActionSql,
      sql: sqlToExecute,
      chartSpec: chartResult.chartSpec,
      metricsInfo,
      queryCategory: llmResponse.query_category,
      error: null,
    }

    QueryResponseSchema.safeParse(response)

    if (chatId) {
      const { addMessageToChat } = await import('@/lib/data/chatStore')
      addMessageToChat(chatId, query, response)
    }

    return NextResponse.json(response)
  } catch (error: any) {
    const latency = Date.now() - startTime
    
    console.error('Query API Error:', {
      message: error.message,
      stack: error.stack,
      query: query || 'unknown',
      latencyMs: latency,
    })
    
    try {
      logEvaluation({
        query: query || 'unknown',
        sql: '',
        success: false,
        errorType: 'unknown',
        latencyMs: latency,
        rowCount: 0,
      })
    } catch (evalError: any) {
      console.error('Failed to log evaluation:', evalError.message)
    }

    let defaultChartSpec
    try {
      defaultChartSpec = getDefaultChartSpec([])
    } catch (chartError: any) {
      defaultChartSpec = { type: null, xField: null, yField: null }
    }

    let errorType: 'validation' | 'execution' | 'llm' | 'unknown' | 'no_files' = 'unknown'
    if (error.message?.includes('Rate limit') || error.message?.includes('429')) {
      errorType = 'llm'
    } else if (error.message?.includes('API key') || error.message?.includes('401') || error.message?.includes('403')) {
      errorType = 'llm'
    } else if (error.message?.includes('validation') || error.message?.includes('Invalid')) {
      errorType = 'validation'
    } else if (error.message?.includes('execution') || error.message?.includes('Query execution')) {
      errorType = 'execution'
    }

    try {
      const errorResponse: QueryResponse = {
        data: [],
        columns: [],
        reasoning: error.message?.includes('Rate limit') 
          ? `Rate limit exceeded: ${error.message}. This is a temporary limit from OpenAI. Please wait for the limit to reset or add a payment method to increase your limits.`
          : `An error occurred: ${error.message || 'Unknown error'}. Please check the server logs for details.`,
        preview_sql: null,
        action_sql: null,
        sql: '', // Legacy
        chartSpec: defaultChartSpec,
        error: {
          message: error.message || 'An unexpected error occurred',
          type: errorType,
        },
      }
      return NextResponse.json(errorResponse, { status: 500 })
    } catch (responseError: any) {
      console.error('Failed to create error response:', responseError)
      return NextResponse.json(
        {
          data: [],
          columns: [],
          reasoning: 'An unexpected server error occurred. Please try again.',
          preview_sql: null,
          action_sql: null,
          sql: '',
          chartSpec: { type: null, xField: null, yField: null },
          error: {
            message: 'Internal server error',
            type: 'unknown' as const,
          },
        },
        { status: 500 }
      )
    }
  }
}
