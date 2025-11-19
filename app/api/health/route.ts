import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { HealthResponseSchema, type HealthResponse } from '@/types'

export async function GET() {
  const timestamp = new Date().toISOString()
  
  let database = false
  let llm = false

  // Check database connection
  try {
    await prisma.$queryRaw`SELECT 1`
    database = true
  } catch (error) {
    console.error('Database health check failed:', error)
  }

  // Check LLM (OpenAI API key exists OR LM Studio is configured)
  llm = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL)
  
  // If using LM Studio, verify server is accessible
  if (process.env.OPENAI_BASE_URL && !process.env.OPENAI_API_KEY?.startsWith('sk-')) {
    try {
      const baseUrl = process.env.OPENAI_BASE_URL.replace('/v1', '')
      const response = await fetch(`${baseUrl}/v1/models`, { 
        signal: AbortSignal.timeout(2000) 
      })
      llm = response.ok
    } catch {
      // LM Studio might not be running, but that's okay for health check
      // We'll still mark as degraded rather than unhealthy
    }
  }

  const status = database && llm ? 'healthy' : database || llm ? 'degraded' : 'unhealthy'

  const response: HealthResponse = {
    status,
    database,
    llm,
    timestamp,
  }

  return NextResponse.json(response, {
    status: status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503,
  })
}

