import { Pool } from 'pg'
import { prisma } from '../db/prisma'
import { MAX_EXECUTION_TIME_MS } from './validator'
import type { ColumnMetadata } from '@/types'

let pgPool: Pool | null = null

function getPgPool(): Pool {
  if (!pgPool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set')
    }
    pgPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  }
  return pgPool
}

export interface ExecutionResult {
  data: Record<string, any>[]
  columns: ColumnMetadata[]
  error?: string
}

/**
 * Execute SQL safely using pg for parameterized queries
 */
export async function executeSqlSafe(sql: string, params: any[] = []): Promise<ExecutionResult> {
  const startTime = Date.now()
  const pool = getPgPool()

  try {
    // Clean SQL: remove trailing semicolons and ensure single statement
    let cleanSql = sql.trim()
    if (cleanSql.endsWith(';')) {
      cleanSql = cleanSql.slice(0, -1).trim()
    }
    
    // Ensure only one statement (prevent SQL injection via multiple statements)
    if (cleanSql.includes(';')) {
      // Take only the first statement
      cleanSql = cleanSql.split(';')[0].trim()
    }

    // Use Promise.race for timeout
    const result = await Promise.race([
      pool.query(cleanSql, params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), MAX_EXECUTION_TIME_MS)
      ),
    ])

    const executionTime = Date.now() - startTime

    if (executionTime > MAX_EXECUTION_TIME_MS) {
      return {
        data: [],
        columns: [],
        error: 'Query execution exceeded maximum time limit.',
      }
    }

    if (!result.rows || result.rows.length === 0) {
      return {
        data: [],
        columns: [],
      }
    }

    // Infer column metadata from result
    const firstRow = result.rows[0]
    const columns: ColumnMetadata[] = result.fields.map(field => ({
      name: field.name,
      type: mapPgTypeToGeneric(field.dataTypeID),
    }))

    // Convert data - handle BigInt, Date, and other special types
    const data = result.rows.map(row => {
      const converted: Record<string, any> = {}
      for (const [key, value] of Object.entries(row)) {
        if (value instanceof Date) {
          converted[key] = value.toISOString()
        } else if (typeof value === 'bigint') {
          // Convert BigInt to Number if safe, otherwise to String
          // JavaScript Number.MAX_SAFE_INTEGER is 2^53 - 1
          if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
            converted[key] = Number(value)
          } else {
            converted[key] = value.toString()
          }
        } else if (value && typeof value === 'object' && 'toNumber' in value) {
          converted[key] = Number(value)
        } else {
          converted[key] = value
        }
      }
      return converted
    })

    return {
      data,
      columns,
    }
  } catch (error: any) {
    return {
      data: [],
      columns: [],
      error: error.message || 'Database execution error',
    }
  }
}

/**
 * Execute SQL using Prisma (for simpler queries)
 */
export async function executeSqlPrisma(sql: string): Promise<ExecutionResult> {
  const startTime = Date.now()

  try {
    // Clean SQL: remove trailing semicolons and ensure single statement
    let cleanSql = sql.trim()
    if (cleanSql.endsWith(';')) {
      cleanSql = cleanSql.slice(0, -1).trim()
    }
    
    // Ensure only one statement (prevent SQL injection via multiple statements)
    if (cleanSql.includes(';')) {
      // Take only the first statement
      cleanSql = cleanSql.split(';')[0].trim()
    }

    const result = await Promise.race([
      prisma.$queryRawUnsafe(cleanSql),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), MAX_EXECUTION_TIME_MS)
      ),
    ]) as any[]

    const executionTime = Date.now() - startTime

    if (executionTime > MAX_EXECUTION_TIME_MS) {
      return {
        data: [],
        columns: [],
        error: 'Query execution exceeded maximum time limit.',
      }
    }

    if (!result || result.length === 0) {
      return {
        data: [],
        columns: [],
      }
    }

    // Infer column metadata
    const firstRow = result[0]
    const columns: ColumnMetadata[] = Object.keys(firstRow).map(key => {
      const value = firstRow[key]
      let type = 'text'
      
      if (typeof value === 'number') {
        type = Number.isInteger(value) ? 'integer' : 'decimal'
      } else if (value instanceof Date) {
        type = 'timestamp'
      } else if (typeof value === 'boolean') {
        type = 'boolean'
      }

      return { name: key, type }
    })

    // Convert data - handle BigInt, Date, and other special types
    const data = result.map(row => {
      const converted: Record<string, any> = {}
      for (const [key, value] of Object.entries(row)) {
        if (value instanceof Date) {
          converted[key] = value.toISOString()
        } else if (typeof value === 'bigint') {
          // Convert BigInt to Number if safe, otherwise to String
          // JavaScript Number.MAX_SAFE_INTEGER is 2^53 - 1
          if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
            converted[key] = Number(value)
          } else {
            converted[key] = value.toString()
          }
        } else if (value && typeof value === 'object' && 'toNumber' in value) {
          converted[key] = Number(value)
        } else {
          converted[key] = value
        }
      }
      return converted
    })

    return {
      data,
      columns,
    }
  } catch (error: any) {
    return {
      data: [],
      columns: [],
      error: error.message || 'Database execution error',
    }
  }
}

/**
 * Map PostgreSQL type IDs to generic types
 */
function mapPgTypeToGeneric(pgTypeId: number): string {
  // Common PostgreSQL type IDs
  const typeMap: Record<number, string> = {
    16: 'boolean',      // BOOLEAN
    20: 'integer',     // BIGINT
    21: 'integer',     // SMALLINT
    23: 'integer',     // INTEGER
    700: 'decimal',    // REAL
    701: 'decimal',    // DOUBLE PRECISION
    1700: 'decimal',   // NUMERIC
    1082: 'date',      // DATE
    1114: 'timestamp', // TIMESTAMP
    1184: 'timestamp', // TIMESTAMPTZ
    25: 'text',        // TEXT
    1043: 'text',      // VARCHAR
  }

  return typeMap[pgTypeId] || 'text'
}

/**
 * Close database connections (for cleanup)
 */
export async function closeConnections(): Promise<void> {
  if (pgPool) {
    await pgPool.end()
    pgPool = null
  }
  await prisma.$disconnect()
}

