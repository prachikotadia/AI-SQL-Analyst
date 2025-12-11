/**
 * Environment variable loader for LLM/OpenRouter configuration
 * Provides safe access to required environment variables with descriptive errors
 */

export interface LLMConfig {
  apiKey: string
  baseURL: string
  model: string
  referer?: string
}

/**
 * Loads and validates LLM environment variables
 * Throws descriptive errors if required variables are missing
 */
export function loadLLMConfig(): LLMConfig {
  const apiKey = process.env.OPENAI_API_KEY
  const baseURL = process.env.OPENAI_BASE_URL
  const model = process.env.OPENAI_MODEL
  const referer = process.env.OPENAI_REFERER

  // Validate required variables
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      'Missing OPENAI_API_KEY — set it in Netlify environment variables (Site settings → Environment variables). See NETLIFY_SETUP.md for instructions.'
    )
  }

  if (!baseURL || baseURL.trim() === '') {
    throw new Error(
      'Missing OPENAI_BASE_URL — set it in Netlify environment variables. For OpenRouter, use: https://openrouter.ai/api/v1'
    )
  }

  if (!model || model.trim() === '') {
    throw new Error(
      'Missing OPENAI_MODEL — set it in Netlify environment variables. For OpenRouter, use: openai/gpt-4o-mini'
    )
  }

  return {
    apiKey: apiKey.trim(),
    baseURL: baseURL.trim(),
    model: model.trim(),
    referer: referer?.trim(),
  }
}

/**
 * Gets OpenRouter-specific headers for API requests
 */
export function getOpenRouterHeaders(referer?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Title': 'AI SQL Analyst',
  }

  if (referer) {
    headers['HTTP-Referer'] = referer
  }

  return headers
}

/**
 * Creates OpenAI client configuration with proper headers for OpenRouter
 */
export function createOpenAIConfig(): {
  apiKey: string
  baseURL: string
  defaultHeaders?: Record<string, string>
} {
  const config = loadLLMConfig()
  const headers = getOpenRouterHeaders(config.referer)

  return {
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: Object.keys(headers).length > 0 ? headers : undefined,
  }
}
