import OpenAI from 'openai'
import type { LLMResponse } from '@/types'
import { createOpenAIConfig, loadLLMConfig } from './env'

export async function generateSql(prompt: string, retryOnError: boolean = true): Promise<LLMResponse> {
  try {
    // Load LLM configuration with validation
    const llmConfig = loadLLMConfig()
    const openAIConfig = createOpenAIConfig()
    const openai = new OpenAI(openAIConfig)
    
    // Check if using LM Studio (localhost/127.0.0.1)
    const isLMStudio = llmConfig.baseURL.includes('localhost') || 
                       llmConfig.baseURL.includes('127.0.0.1') || 
                       llmConfig.baseURL.includes('1234')
    
    interface ChatCompletionRequest {
      model: string
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      temperature: number
      response_format?: { type: 'json_object' }
    }
    
    const requestOptions: ChatCompletionRequest = {
      model: llmConfig.model,
      messages: [
        {
          role: 'system',
          content: 'You are a SQL expert. Always respond with valid JSON only, no markdown, no code blocks, no explanations outside the JSON. Your response must be a valid JSON object.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
    }
    
    // Only use response_format for real OpenAI API, not LM Studio
    if (!isLMStudio) {
      requestOptions.response_format = { type: 'json_object' }
    }
    
    const response = await openai.chat.completions.create(requestOptions)

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('Empty response from OpenAI')
    }

    // Parse JSON response
    let parsed: LLMResponse
    try {
      parsed = JSON.parse(content)
    } catch (parseError) {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1])
      } else {
        throw new Error('Invalid JSON response from LLM')
      }
    }

    // Validate required fields
    if (!parsed.sql || !parsed.reasoning || !parsed.chart) {
      throw new Error('Missing required fields in LLM response')
    }

    return parsed
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    if (retryOnError && errorMessage.includes('JSON')) {
      // Retry once with a repair prompt
      const repairPrompt = `Your previous response was invalid JSON. Please fix it and return ONLY valid JSON.

Previous response: ${errorMessage}

Original prompt: ${prompt}

Return valid JSON with fields: sql, reasoning, chart (with type, xField, yField), and optional metric_name.`
      
      return generateSql(repairPrompt, false)
    }

    throw error
  }
}

