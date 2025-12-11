import OpenAI from 'openai'
import { buildPrompt, buildChatPrompt } from './prompt'
import { repairJson } from './jsonRepair'
import type { LLMResponse } from '@/types'

// Response format for chat sessions with uploaded files
export interface ChatLLMResponse {
  reasoning: string
  sql: string
  chart: {
    type: string
    xField: string
    yField: string
    seriesField: string
    data?: unknown
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'lm-studio', // LM Studio doesn't require a real key
  baseURL: process.env.OPENAI_BASE_URL || 'http://127.0.0.1:1234/v1', // LM Studio local server
})

export interface NLToSqlOptions {
  query: string
  timeRange?: 'last_7_days' | 'last_30_days' | 'last_90_days' | 'all_time'
  retryOnError?: boolean
}

export interface NLToSqlResult {
  response: LLMResponse
  tokensUsed?: number
  error?: string
}

// Convert natural language queries to SQL using the language model
// Handles JSON parsing, retries on errors, and works with both OpenAI and LM Studio
export async function nlToSql(options: NLToSqlOptions): Promise<NLToSqlResult> {
  const { query, timeRange, retryOnError = true } = options

  try {
    const prompt = await buildPrompt(query, timeRange)

    // LM Studio doesn't support 'json_object' format, use 'text' instead
    // Check if using LM Studio (default baseURL or localhost/127.0.0.1)
    const baseURL = process.env.OPENAI_BASE_URL || 'http://127.0.0.1:1234/v1'
    const isLMStudio = baseURL.includes('localhost') || baseURL.includes('127.0.0.1') || baseURL.includes('1234')
    
    interface ChatCompletionRequest {
      model: string
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      temperature: number
      max_tokens: number
      response_format?: { type: 'json_object' }
    }
    
    const requestOptions: ChatCompletionRequest = {
      model: process.env.OPENAI_MODEL || 'llama-3.2-1b-instruct', // LM Studio model name
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
      max_tokens: 2000, // Increase max tokens to prevent truncation
    }
    
    // Only use response_format for real OpenAI API, not LM Studio
    if (!isLMStudio) {
      requestOptions.response_format = { type: 'json_object' }
    }
    
    const completion = await openai.chat.completions.create(requestOptions)

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('Empty response from OpenAI')
    }

    // Check if response is HTML (error page)
    if (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html')) {
      throw new Error('LLM returned HTML instead of JSON. Check if LM Studio server is running and accessible.')
    }

    // Parse JSON response
    let parsed: LLMResponse
    try {
      parsed = JSON.parse(content)
    } catch (parseError: unknown) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error'
      
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1])
        } catch {
          // Try to repair JSON (handles truncated JSON)
          const repaired = repairJson(jsonMatch[1])
          if (repaired) {
            try {
              parsed = JSON.parse(repaired)
            } catch (repairError) {
              throw new Error(`Invalid JSON response from LLM (truncated or malformed). Raw content: ${content.substring(0, 300)}...`)
            }
          } else {
            throw new Error(`Invalid JSON response from LLM (could not repair). Raw content: ${content.substring(0, 300)}...`)
          }
        }
      } else {
        // Try to repair JSON (handles truncated JSON)
        const repaired = repairJson(content)
        if (repaired) {
          try {
            parsed = JSON.parse(repaired)
          } catch (repairError) {
            throw new Error(`Invalid JSON response from LLM (truncated or malformed). Raw content: ${content.substring(0, 300)}...`)
          }
        } else {
          throw new Error(`Invalid JSON response from LLM (could not repair). Raw content: ${content.substring(0, 300)}...`)
        }
      }
    }

    // Validate required fields (new format: preview_sql/action_sql, or legacy: sql)
    if (!parsed.preview_sql && !parsed.action_sql && !parsed.sql) {
      throw new Error('Missing required fields in LLM response: need preview_sql/action_sql or sql')
    }
    if (!parsed.reasoning || !parsed.chart) {
      throw new Error('Missing required fields in LLM response: need reasoning and chart')
    }
    
    // Backward compatibility: if old format (sql), convert to new format
    if (parsed.sql && !parsed.preview_sql) {
      parsed.preview_sql = parsed.sql
      parsed.action_sql = null
    }

    const tokensUsed = completion.usage?.total_tokens

    return {
      response: parsed,
      tokensUsed,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    if (retryOnError && (errorMessage.includes('JSON') || errorMessage.includes('parse'))) {
      // Retry once with a repair prompt
      const repairPrompt = `Your previous response was invalid JSON. Please fix it and return ONLY valid JSON.

Previous error: ${errorMessage}

Original prompt: ${await buildPrompt(query, timeRange)}

Return valid JSON with fields: preview_sql, action_sql, reasoning, chart (with type, xField, yField).`
      
      // Check if using LM Studio (for retry)
      const baseURL = process.env.OPENAI_BASE_URL || 'http://127.0.0.1:1234/v1'
      const isLMStudioRetry = baseURL.includes('localhost') || baseURL.includes('127.0.0.1') || baseURL.includes('1234')
      
      try {
        interface ChatCompletionRequest {
          model: string
          messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
          temperature: number
          max_tokens: number
          response_format?: { type: 'json_object' }
        }
        
        const retryRequestOptions: ChatCompletionRequest = {
          model: process.env.OPENAI_MODEL || 'llama-3.2-1b-instruct', // LM Studio model name
          messages: [
            {
              role: 'system',
              content: 'You are a SQL expert. Always respond with valid JSON only. Make sure to close all JSON objects and strings properly.',
            },
            {
              role: 'user',
              content: repairPrompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 2000, // Increase max tokens to prevent truncation
        }
        
        // Only use response_format for real OpenAI API, not LM Studio
        if (!isLMStudioRetry) {
          retryRequestOptions.response_format = { type: 'json_object' }
        }
        
        const retryCompletion = await openai.chat.completions.create(retryRequestOptions)

        const retryContent = retryCompletion.choices[0]?.message?.content
        if (retryContent) {
          const repaired = repairJson(retryContent) || retryContent
          const parsed = JSON.parse(repaired)
          
          if ((parsed.preview_sql || parsed.action_sql || parsed.sql) && parsed.reasoning && parsed.chart) {
            // Backward compatibility
            if (parsed.sql && !parsed.preview_sql) {
              parsed.preview_sql = parsed.sql
              parsed.action_sql = null
            }
            return {
              response: parsed,
              tokensUsed: retryCompletion.usage?.total_tokens,
            }
          }
        }
      } catch (retryError) {
        // Fall through to return error
      }
    }

    return {
      response: {
        preview_sql: null,
        action_sql: null,
        reasoning: 'Failed to generate SQL query.',
        chart: { type: 'table', xField: null, yField: null },
      },
      error: errorMessage || 'Failed to convert natural language to SQL',
    }
  }
}

// Convert natural language to SQL for chat sessions with uploaded files
// Uses file-specific prompts that include schema and sample data
export async function nlToSqlForChat(
  userQuery: string,
  tableName: string,
  columns: Array<{ name: string; type: string }>,
  data: Record<string, unknown>[],
  retryOnError: boolean = true
): Promise<{ response: ChatLLMResponse; error?: string }> {
  try {
    const prompt = buildChatPrompt(userQuery, tableName, columns, data)

    // Check if using LM Studio
    const baseURL = process.env.OPENAI_BASE_URL || 'http://127.0.0.1:1234/v1'
    const isLMStudio = baseURL.includes('localhost') || baseURL.includes('127.0.0.1') || baseURL.includes('1234')
    
    interface ChatCompletionRequest {
      model: string
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      temperature: number
      max_tokens: number
      response_format?: { type: 'json_object' }
    }
    
    const requestOptions: ChatCompletionRequest = {
      model: process.env.OPENAI_MODEL || 'llama-3.2-1b-instruct',
      messages: [
        {
          role: 'system',
          content: 'You are a SQL expert working with uploaded CSV/Excel files. Always respond with valid JSON only, no markdown, no code blocks, no explanations outside the JSON. Your response must be a valid JSON object with fields: reasoning, sql, chart. Make sure to close all JSON objects and strings properly.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }
    
    if (!isLMStudio) {
      requestOptions.response_format = { type: 'json_object' }
    }
    
    const completion = await openai.chat.completions.create(requestOptions)
    const content = completion.choices[0]?.message?.content

    if (!content) {
      throw new Error('Empty response from LLM')
    }

    // Check if response is HTML (error page)
    if (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html')) {
      throw new Error('LLM returned HTML instead of JSON. Check if LM Studio server is running and accessible.')
    }

    // Parse JSON response
    let parsed: ChatLLMResponse
    try {
      parsed = JSON.parse(content)
    } catch (parseError: unknown) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1])
        } catch {
          // Try to repair JSON
          const repaired = repairJson(jsonMatch[1])
          if (repaired) {
            try {
              parsed = JSON.parse(repaired)
            } catch {
              throw new Error(`Invalid JSON response from LLM (truncated or malformed). Raw content: ${content.substring(0, 300)}...`)
            }
          } else {
            throw new Error(`Invalid JSON response from LLM (could not repair). Raw content: ${content.substring(0, 300)}...`)
          }
        }
      } else {
        // Try to repair JSON
        const repaired = repairJson(content)
        if (repaired) {
          try {
            parsed = JSON.parse(repaired)
          } catch {
            throw new Error(`Invalid JSON response from LLM (truncated or malformed). Raw content: ${content.substring(0, 300)}...`)
          }
        } else {
          throw new Error(`Invalid JSON response from LLM (could not repair). Raw content: ${content.substring(0, 300)}...`)
        }
      }
    }

    // Validate required fields
    if (!parsed.reasoning || !parsed.sql || !parsed.chart) {
      throw new Error('Missing required fields in LLM response: need reasoning, sql, and chart')
    }

    // Ensure chart has all required fields
    if (!parsed.chart.type || !parsed.chart.xField || !parsed.chart.yField || parsed.chart.seriesField === undefined) {
      parsed.chart = {
        type: parsed.chart.type || 'not_available',
        xField: parsed.chart.xField || 'not_available',
        yField: parsed.chart.yField || 'not_available',
        seriesField: parsed.chart.seriesField || 'not_available',
      }
    }

    return { response: parsed }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    if (retryOnError && (errorMessage.includes('JSON') || errorMessage.includes('parse'))) {
      // Retry once with a repair prompt
      const repairPrompt = `Your previous response was invalid JSON. Please fix it and return ONLY valid JSON.

Previous error: ${errorMessage}

Original prompt: ${buildChatPrompt(userQuery, tableName, columns, data)}

Return valid JSON with fields: reasoning, sql, chart (with type, xField, yField, seriesField).`
      
      const baseURL = process.env.OPENAI_BASE_URL || 'http://127.0.0.1:1234/v1'
      const isLMStudioRetry = baseURL.includes('localhost') || baseURL.includes('127.0.0.1') || baseURL.includes('1234')
      
      try {
        interface ChatCompletionRequest {
          model: string
          messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
          temperature: number
          max_tokens: number
          response_format?: { type: 'json_object' }
        }
        
        const retryRequestOptions: ChatCompletionRequest = {
          model: process.env.OPENAI_MODEL || 'llama-3.2-1b-instruct',
          messages: [
            {
              role: 'system',
              content: 'You are a SQL expert. Always respond with valid JSON only. Make sure to close all JSON objects and strings properly.',
            },
            {
              role: 'user',
              content: repairPrompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }
        
        if (!isLMStudioRetry) {
          retryRequestOptions.response_format = { type: 'json_object' }
        }
        
        const retryCompletion = await openai.chat.completions.create(retryRequestOptions)
        const retryContent = retryCompletion.choices[0]?.message?.content

        if (retryContent) {
          const repaired = repairJson(retryContent) || retryContent
          const parsed = JSON.parse(repaired)
          
          if (parsed.reasoning && parsed.sql && parsed.chart) {
            // Ensure chart has all required fields
            if (!parsed.chart.type || !parsed.chart.xField || !parsed.chart.yField || parsed.chart.seriesField === undefined) {
              parsed.chart = {
                type: parsed.chart.type || 'not_available',
                xField: parsed.chart.xField || 'not_available',
                yField: parsed.chart.yField || 'not_available',
                seriesField: parsed.chart.seriesField || 'not_available',
              }
            }
            return { response: parsed }
          }
        }
      } catch (retryError) {
        // Fall through to return error
      }
    }

    return {
      response: {
        reasoning: 'not_available: Failed to generate SQL query.',
        sql: 'not_available',
        chart: {
          type: 'not_available',
          xField: 'not_available',
          yField: 'not_available',
          seriesField: 'not_available',
        },
      },
      error: error.message || 'Failed to convert natural language to SQL',
    }
  }
}

