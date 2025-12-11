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
import { validateQuery, isOutOfScopeQuery } from '@/lib/utils/queryValidator'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let query = ''

  try {
    let body
    try {
      body = await request.json()
    } catch (parseError: any) {
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
          reasoning: `Invalid request: ${validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          preview_sql: null,
          action_sql: null,
          sql: '',
          chartSpec: getDefaultChartSpec([]),
          error: {
            message: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') || 'Invalid request',
            type: 'validation' as const,
          },
        },
        { status: 400 }
      )
    }

    const { query: validatedQuery, timeRange, fileIds = [], chatId } = validationResult.data
    query = validatedQuery

    // File resolution: try multiple sources to ensure files are found
    // 1. Use fileIds from request (frontend sends all chat files)
    // 2. If empty, get files from chatStore using chatId
    // 3. If disk storage is empty, recover files from chatStore and re-save to disk
    let finalFileIds: string[] = []
    let attachedFiles: FileMetadata[] = []

    // Step 1: Use fileIds from request if provided
    if (fileIds && fileIds.length > 0) {
      finalFileIds = [...fileIds]
    }
    
    // Step 2: If no fileIds but chatId exists, get files from chatStore
    // This is the CRITICAL fallback that ensures files persist across queries
    if (chatId && finalFileIds.length === 0) {
      try {
        let chat = getChat(chatId)
        
        // If chat doesn't exist, create it
        if (!chat) {
          const { createChat } = await import('@/lib/data/chatStore')
          const newChatId = createChat(chatId.startsWith('chat_') ? chatId : undefined)
          chat = getChat(newChatId)
          
          if (!chat) {
            const fallbackId = createChat()
            chat = getChat(fallbackId)
          }
        }
        
        if (chat) {
          const chatFiles = getChatFiles(chat.chatId)
          const chatFileIds = (chatFiles || []).map((f: FileMetadata) => f?.id).filter(Boolean) as string[]
          
          // Use chatStore files as the source of truth
          finalFileIds = chatFileIds
        }
      } catch (chatError: any) {
        // Failed to get chat files from chatStore, continue with empty fileIds
      }
    } else if (chatId && finalFileIds.length > 0) {
      // Step 3: If we have both fileIds and chatId, merge to ensure completeness
      try {
        const chat = getChat(chatId)
        if (chat) {
          const chatFiles = getChatFiles(chat.chatId)
          const chatFileIds = (chatFiles || []).map((f: FileMetadata) => f?.id).filter(Boolean) as string[]
          
          // Merge chatStore files with request fileIds (avoid duplicates)
          for (const fileId of chatFileIds) {
            if (fileId && !finalFileIds.includes(fileId)) {
              finalFileIds.push(fileId)
            }
          }
        }
      } catch (chatError: any) {
        // Failed to merge chatStore files, continue with existing fileIds
      }
    }
    
    // Get file metadata from disk storage
    attachedFiles = getFilesByIds(finalFileIds)
    
    // CRITICAL FIX: If disk storage is empty but we have fileIds, try to get files from chatStore
    // This handles cases where files were uploaded but not saved to disk (shouldn't happen, but safety net)
    if (finalFileIds.length > 0 && attachedFiles.length === 0 && chatId) {
      try {
        const chat = getChat(chatId)
        if (chat) {
          const chatFiles = getChatFiles(chat.chatId)
          
          // Filter to only files that match our fileIds
          const matchingChatFiles = chatFiles.filter(f => finalFileIds.includes(f.id))
          if (matchingChatFiles.length > 0) {
            // CRITICAL: Re-register files to disk with their original IDs
            // This ensures they persist for future queries
            try {
              const { reRegisterFile } = await import('@/lib/data/fileRegistry')
              for (const file of matchingChatFiles) {
                reRegisterFile(file)
              }
              
              // Now get files from disk
              attachedFiles = getFilesByIds(finalFileIds)
            } catch (regError) {
              // Could not re-save files to disk, use chatStore files directly
              attachedFiles = matchingChatFiles
            }
          }
        }
      } catch (error) {
        // Failed to recover files from chatStore, continue with empty attachedFiles
      }
    }
    
    const hasFileIds = finalFileIds.length > 0
    const hasAttachedFiles = attachedFiles.length > 0
    
    // If we have fileIds but no attachedFiles, try to recover from chatStore
    if (hasFileIds && !hasAttachedFiles) {
      const chat = chatId ? getChat(chatId) : null
      const chatFiles = chat ? getChatFiles(chat.chatId) : []
      
      // Last resort: try to get ANY files from chatStore (even if IDs don't match)
      // This handles cases where fileIds might be wrong but chat has files
      if (chatFiles.length > 0) {
        attachedFiles = chatFiles
        // Re-register them
        try {
          const { reRegisterFile } = await import('@/lib/data/fileRegistry')
          for (const file of chatFiles) {
            reRegisterFile(file)
          }
        } catch (error) {
          // Failed to re-register, continue with chatStore files
        }
      }
    }

    // Only require files if this is the first query and chat has no files
    // If chat already has files (even if registry is empty), we'll recover them
    const chat = chatId ? getChat(chatId) : null
    const isFirstQuery = !chat || chat.messages.length === 0
    const chatHasFiles = chat && chat.attachedFiles.length > 0
    
    // Don't require files if:
    // 1. Chat has files in chatStore (we'll recover them)
    // 2. We have fileIds from request
    // 3. It's not the first query (user already queried before)
    const shouldRequireFiles = isFirstQuery && finalFileIds.length === 0 && !chatHasFiles && !hasAttachedFiles
    
    if (shouldRequireFiles) {
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
    
    // If we have fileIds or chat has files, proceed even if attachedFiles is empty
    // Files will be recovered from chatStore during validation/execution

    // Validate query for out-of-scope content (only if we have files)
    if (attachedFiles.length > 0) {
      const scopeCheck = isOutOfScopeQuery(query, attachedFiles)
      if (scopeCheck.isOutOfScope) {
        return NextResponse.json(
          {
            data: [],
            columns: [],
            reasoning: scopeCheck.reason || 'This query is not related to the uploaded data files.',
            preview_sql: null,
            action_sql: null,
            sql: '',
            chartSpec: getDefaultChartSpec([]),
            error: {
              message: scopeCheck.reason || 'This query is not related to the uploaded data files.',
              type: 'out_of_scope' as const,
            },
          },
          { status: 200 }
        )
      }
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
        // Pass chatId so prompt builder can recover files from chatStore if needed
        prompt = buildPromptFromFiles(query, finalFileIds, timeRange, chatId)
        if (!prompt || prompt.trim().length === 0) {
          throw new Error('Generated prompt is empty')
        }
      } catch (promptError: any) {
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
            content: `SYSTEM ROLE: YOU ARE A STRICT SQL GENERATOR FOR AN IN-MEMORY ANALYTICS ENGINE

You NEVER return random results. You ALWAYS generate deterministic, correct SQL that the backend can execute directly on an in-memory table.

You have ONE JOB:
Given:
- a table name
- a list of column names and types
- a natural language query

You must return a SINGLE, SAFE, VALID SQL SELECT statement plus a short reasoning string in JSON.

You MUST obey all rules below EXACTLY. Do not be "creative". Do not ignore any rule.

======================
1. FILE MEMORY (Persistent Context Within Chat)
======================
- You MUST remember all uploaded CSV/Excel files for the entire chat session.
- If the user asks a new question, use the previously uploaded files without requesting re-upload.
- Never assume files are removed unless explicitly deleted.
- Never ask the user again for file upload.

======================
2. TOP / HIGHEST / LOWEST / CHEAPEST / MOST EXPENSIVE
======================

When the user uses any of these words:
- "top", "top N", "highest", "most expensive", "largest", "biggest"
- "lowest", "smallest", "cheapest", "least expensive"
you MUST:

1) Identify the numeric sort column from the schema.
   - Prefer columns named like: price, amount, total, revenue, cost, score, rating, quantity, stock.
   - Use EXACT column names from the schema (case-insensitive match).
   - NEVER invent a column that does not exist.

2) Determine the correct sort direction:
   - "top", "highest", "most expensive", "largest", "biggest" → ORDER BY <column> DESC
   - "lowest", "smallest", "cheapest", "least expensive" → ORDER BY <column> ASC

3) Always include LIMIT:
   - If the user says "top N" or "bottom N" → use that N.
   - If the user only says "top items" with no number → use LIMIT 10.

4) Always sort numerically, NOT lexicographically.
   - If the column type is numeric (integer, decimal, float, number) → use ORDER BY "<column>" <ASC|DESC>.
   - If the column type is text/string but clearly represents numbers (like "Price") → cast to numeric:
     ORDER BY CAST("<column>" AS DOUBLE PRECISION) <ASC|DESC>

5) If the user says "top 10 items by Price":
   - You MUST use the "Price" column from the schema.
   - You MUST generate:
     ORDER BY CAST("Price" AS DOUBLE PRECISION) DESC
     LIMIT 10;

6) If you cannot find a valid numeric column to sort by:
   - Do NOT guess.
   - Return a reasoning message like:
     "Cannot answer: no numeric column found to sort 'top' or 'bottom' results."
   - Still return syntactically valid SQL that SELECTs but does NOT pretend to be "top N".

======================
3. SCHEMA STRICTNESS
======================
- Use ONLY the columns and tables provided in the schema section of the prompt.
- If the user mentions a column that does not exist:
  → Immediately return an error in the 'reasoning' field explaining the invalid column.
  → Do NOT attempt to guess or create new columns.
- SQL MUST be syntactically correct and compatible with the provided schema.

======================
4. GENERAL SQL RULES
======================
- Use ONLY the tables and columns provided in the schema.
- NEVER invent table or column names.
- Use a single SELECT statement (no CTEs, no multi-statements).
- No INSERT/UPDATE/DELETE/DDL. READ-ONLY SELECT only.
- Use double quotes around identifiers if needed: "Price", "Category".
- Use single quotes around string literals: 'Books & Stationery'.
- Use lowercase SQL keywords.
- Never alias columns unless needed.
- Keep queries simple, clear, deterministic.

======================
5. SQL RELEVANCE & FOCUS
======================
- SQL must ALWAYS directly answer the user's natural-language query.
- NEVER generate irrelevant queries.
- NEVER produce generic SQL unrelated to the provided data.
- NEVER include features not supported by the execution engine (JOINs, subqueries, window functions, etc.) unless the prompt explicitly states they are supported.

======================
6. OUTPUT FORMAT (MANDATORY)
======================

You MUST ALWAYS respond in this exact JSON format:

{
  "sql": "<single-line SQL statement ending with a semicolon>",
  "reasoning": "<short explanation of how you interpreted the query and chose columns, sort direction, and LIMIT. Be explicit for any 'top' or 'bottom' logic.>",
  "chart": {
    "type": null,
    "xField": null,
    "yField": null
  }
}

- "sql" MUST contain the FULL query, including ORDER BY and LIMIT if applicable.
- "reasoning" MUST explain how you handled top/bottom and which column you used for sorting.
- "chart" MUST always be present (can be null fields if not applicable).

======================
7. IF USER QUERY IS AMBIGUOUS
======================

If the user says only:
- "Top 10 items"
and does NOT specify a column:

- Choose the most meaningful numeric column from the schema (prefer 'Price', then 'Stock', 'Quantity', 'Score').
- Explain in reasoning: which column you chose and why.

If absolutely no numeric column exists, explain that clearly in reasoning.

======================
8. EXAMPLES YOU MUST FOLLOW
======================

Example 1:
User: "Show me the top 10 items by Price"

Response:
{
  "sql": "SELECT * FROM products_100 ORDER BY CAST(\"Price\" AS DOUBLE PRECISION) DESC LIMIT 10;",
  "reasoning": "User asked for top 10 items by price, so I sorted by the Price column in descending order and limited the result to 10 rows, casting to numeric to ensure correct numeric sorting.",
  "chart": {"type": null, "xField": null, "yField": null}
}

Example 2:
User: "Show the 5 cheapest products"

Response:
{
  "sql": "SELECT * FROM products_100 ORDER BY CAST(\"Price\" AS DOUBLE PRECISION) ASC LIMIT 5;",
  "reasoning": "User asked for the cheapest 5 products, so I sorted by Price ascending and limited the result to 5 rows, casting to numeric for proper numeric ordering.",
  "chart": {"type": null, "xField": null, "yField": null}
}

Example 3:
User: "Top items by stock"

Response:
{
  "sql": "SELECT * FROM products_100 ORDER BY \"Stock\" DESC LIMIT 10;",
  "reasoning": "User asked for top items by stock, so I sorted by Stock in descending order and used default limit 10.",
  "chart": {"type": null, "xField": null, "yField": null}
}

======================
9. MULTI-QUESTION FLOW
======================
- Each user query should be treated as a new question about the SAME dataset.
- You MUST give SQL immediately, without requiring schema restatement.
- You MUST maintain chat state across turns.

If the user asks:
"What were the top 5 products by price?"
→ Generate SQL using the existing file.

If the user asks next:
"Now show only the ones in Electronics category"
→ Use the SAME file context.
→ Do NOT ask for re-upload or schema.
→ Filter based on previous dataset.

======================
FAILURE CONDITIONS (never do these):
======================
- Do not hallucinate columns or tables.
- Do not forget previously uploaded files.
- Do not generate irrelevant SQL.
- Do not explicitly ask for file upload again.
- Do not produce broken JSON.
- Do not guess values or invent data.
- Do not omit ORDER BY or LIMIT for TOP/BOTTOM queries.
- Do not return unsorted or random rows for "top" or "cheapest" requests.

======================
OBEY THESE RULES EVEN IF THEY CONFLICT WITH YOUR USUAL BEHAVIOR.
DO NOT OMIT ORDER BY OR LIMIT FOR TOP/BOTTOM QUERIES.
DO NOT RETURN UNSORTED OR RANDOM ROWS FOR "TOP" OR "CHEAPEST" REQUESTS.

Always respond with valid JSON only, no markdown, no code blocks, no explanations outside the JSON. Your response must be a valid JSON object. Make sure to close all JSON objects and strings properly.`,
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

      // Fix SQL for top/bottom queries - ensures numeric sorting even if LLM doesn't generate CAST
      let sqlToExecute = parsed.sql
      if (sqlToExecute && sqlToExecute !== 'not_available' && attachedFiles.length > 0) {
        // Apply typo correction using fuzzy matching
        const { correctQueryTypos } = await import('@/lib/utils/queryValidator')
        const correctionResult = correctQueryTypos(sqlToExecute, attachedFiles)
        if (correctionResult.corrections.length > 0) {
          sqlToExecute = correctionResult.correctedSql
          parsed.sql = sqlToExecute
        }
        
        // Apply safety net for numeric sorting in ORDER BY clauses
        const { applySqlSafetyNet } = await import('@/lib/sql/sqlSafetyNet')
        const allColumns = attachedFiles.flatMap(file => file.columns || [])
        sqlToExecute = applySqlSafetyNet(sqlToExecute, query, allColumns)
        
        if (sqlToExecute !== parsed.sql) {
          parsed.sql = sqlToExecute
        }
      }

      let schemaValidation
      try {
        // CRITICAL: Use attachedFiles if we recovered them from chatStore, otherwise use finalFileIds
        // This ensures validation works even when fileRegistry is empty
        const filesForValidation = attachedFiles.length > 0 
          ? attachedFiles.map(f => f.id)
          : finalFileIds
        
        // CRITICAL: If we have attachedFiles (recovered from chatStore), validation should use them
        // The validator will recover from chatStore if needed, but we've already done that
        // Pass chatId to validator so it can recover files from chatStore if fileRegistry is empty
        schemaValidation = validateSqlAgainstSchema(parsed.sql, filesForValidation, chatId)
      } catch (validationError: any) {
        throw new Error(`Schema validation failed: ${validationError.message}`)
      }
      
      if (!schemaValidation.valid) {
        // If validation failed due to no files, but we have fileIds, that's a critical issue
        if (schemaValidation.error?.includes('No files attached') && finalFileIds.length > 0) {
          // Check if files exist on disk
          const missingFiles = finalFileIds.filter(fileId => {
            const file = getFilesByIds([fileId])
            return file.length === 0
          })
          
          if (missingFiles.length > 0) {
            throw new Error(`Files not found on disk: ${missingFiles.join(', ')}. Files should be saved to disk on upload. Please re-upload if necessary.`)
          } else {
            throw new Error(`Files found but validation failed. This may indicate a schema mismatch.`)
          }
        }
        
        const retryPrompt = buildPromptFromFiles(
          `The previous SQL query failed validation: ${schemaValidation.error}. Fix it using only the tables and columns from the schema. Original question: ${query}`,
          finalFileIds,
          timeRange,
          chatId
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
              // Apply safety net to retry SQL as well
              let retrySql = retryParsed.sql
              if (retrySql && retrySql !== 'not_available' && attachedFiles.length > 0) {
                const { applySqlSafetyNet } = await import('@/lib/sql/sqlSafetyNet')
                const allColumns = attachedFiles.flatMap(file => file.columns || [])
                retrySql = applySqlSafetyNet(retrySql, query, allColumns)
              }
              parsed.sql = retrySql
              if (retryParsed.reasoning) {
                parsed.reasoning = retryParsed.reasoning
              }
              // Re-validate (pass chatId for file recovery, use attachedFiles if available)
              let retryValidation
              try {
                const filesForRetryValidation = attachedFiles.length > 0 
                  ? attachedFiles.map(f => f.id)
                  : finalFileIds
                retryValidation = validateSqlAgainstSchema(parsed.sql, filesForRetryValidation, chatId)
              } catch (retryValidationError: any) {
                throw new Error(`SQL validation failed: ${retryValidationError.message}`)
              }
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
    
    // Read queries should never have action_sql - force it to not_available
    if (isReadQuery && actionSql && actionSql !== 'not_available' && actionSql !== null) {
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

    // CRITICAL: When we have uploaded files, use file-based validation, not database validation
    // Database validation (validateSql) checks PostgreSQL tables, which don't include uploaded CSV/Excel files
    let validation
    let finalSqlToValidate = sqlToValidate
    
    // Ensure we have the latest file information (may have been recovered from chatStore earlier)
    const hasFiles = attachedFiles.length > 0 || finalFileIds.length > 0
    
    if (hasFiles) {
      // Use file-based validation for uploaded files
      const filesForValidation = attachedFiles.length > 0 
        ? attachedFiles.map(f => f.id)
        : finalFileIds
      validation = validateSqlAgainstSchema(sqlToValidate, filesForValidation, chatId)
      
      if (validation.correctedSql) {
        finalSqlToValidate = validation.correctedSql
        llmResponse.preview_sql = validation.correctedSql
      }
    } else {
      // Only use database validation if no files are uploaded (legacy mode)
      validation = await validateSql(sqlToValidate)
      
      if (validation.correctedSql) {
        finalSqlToValidate = validation.correctedSql
        llmResponse.preview_sql = validation.correctedSql
      }
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
      
      // Use same validation method for repaired SQL
      let repairValidation
      if (attachedFiles.length > 0 || finalFileIds.length > 0) {
        const filesForRepairValidation = attachedFiles.length > 0 
          ? attachedFiles.map(f => f.id)
          : finalFileIds
        repairValidation = validateSqlAgainstSchema(repairedPreview, filesForRepairValidation, chatId)
      } else {
        repairValidation = await validateSql(repairedPreview)
      }
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
      // Use file-based validation for action SQL if we have uploaded files
      let actionValidation
      if (attachedFiles.length > 0 || finalFileIds.length > 0) {
        const filesForActionValidation = attachedFiles.length > 0 
          ? attachedFiles.map(f => f.id)
          : finalFileIds
        actionValidation = validateSqlAgainstSchema(actionSql, filesForActionValidation, chatId)
      } else {
        actionValidation = await validateSql(actionSql)
      }
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

    let sqlToExecute = sanitizeSql(llmResponse.preview_sql || finalSqlToValidate)
    
    // Apply fixes for top/bottom queries before execution - ensures numeric sorting
    if (sqlToExecute && sqlToExecute !== 'not_available' && attachedFiles.length > 0) {
      const { applySqlSafetyNet } = await import('@/lib/sql/sqlSafetyNet')
      const allColumns = attachedFiles.flatMap(file => file.columns || [])
      const fixedSql = applySqlSafetyNet(sqlToExecute, query, allColumns)
      
      if (fixedSql !== sqlToExecute) {
        sqlToExecute = fixedSql
      }
    }
    
    let executionResult
    try {
      executionResult = executeMultiFileQuery(sqlToExecute, finalFileIds)
    } catch (execError: any) {
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
    
    // Calculate query complexity
    const { calculateQueryComplexity } = await import('@/lib/utils/querySuggestions')
    const queryComplexity = calculateQueryComplexity(sqlToExecute)
    
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
      performanceMetrics: {
        executionTimeMs: latency,
        tokenUsage: llmResult.tokensUsed,
        queryComplexity,
        sqlLength: sqlToExecute.length,
      },
      error: null,
    }

    QueryResponseSchema.safeParse(response)

    if (chatId) {
      const { addMessageToChat, getChat } = await import('@/lib/data/chatStore')
      addMessageToChat(chatId, query, response)
      
      // Update chat title in backend (meaningful title from first query)
      const updatedChat = getChat(chatId)
      if (updatedChat) {
        // Title is automatically updated by addMessageToChat if it's the first message
        // This ensures sidebar shows meaningful titles
      }
    }

    return NextResponse.json(response)
  } catch (error: any) {
    const latency = Date.now() - startTime
    
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
      // Failed to log evaluation, continue anyway
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
