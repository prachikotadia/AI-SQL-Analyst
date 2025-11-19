import OpenAI from 'openai'
import type { LLMResponse } from '@/types'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'lm-studio', // LM Studio doesn't require a real key
  baseURL: process.env.OPENAI_BASE_URL || 'http://127.0.0.1:1234/v1', // LM Studio local server
})

export async function generateSql(prompt: string, retryOnError: boolean = true): Promise<LLMResponse> {
  try {
    // LM Studio doesn't support 'json_object' format, use 'text' instead
    // Check if using LM Studio (default baseURL or localhost/127.0.0.1)
    const baseURL = process.env.OPENAI_BASE_URL || 'http://127.0.0.1:1234/v1'
    const isLMStudio = baseURL.includes('localhost') || baseURL.includes('127.0.0.1') || baseURL.includes('1234')
    
    const requestOptions: any = {
      model: process.env.OPENAI_MODEL || 'llama-3.2-1b-instruct', // LM Studio model name
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
  } catch (error: any) {
    if (retryOnError && error.message.includes('JSON')) {
      // Retry once with a repair prompt
      const repairPrompt = `Your previous response was invalid JSON. Please fix it and return ONLY valid JSON.

Previous response: ${error.message}

Original prompt: ${prompt}

Return valid JSON with fields: sql, reasoning, chart (with type, xField, yField), and optional metric_name.`
      
      return generateSql(repairPrompt, false)
    }

    throw error
  }
}

