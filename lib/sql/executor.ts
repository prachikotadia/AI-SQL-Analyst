import { executeSqlPrisma } from './safeRunner'
import type { ExecutionResult } from './safeRunner'

// Re-export for backward compatibility
export type { ExecutionResult }

export async function executeSql(sql: string): Promise<ExecutionResult> {
  // Use Prisma executor by default
  return executeSqlPrisma(sql)
}

