import { executeSqlPrisma } from './safeRunner'
import type { ExecutionResult } from './safeRunner'

// Re-export for backward compatibility
export type { ExecutionResult }

// Main SQL execution entry point - delegates to Prisma executor
// This abstraction allows us to swap executors if needed
export async function executeSql(sql: string): Promise<ExecutionResult> {
  return executeSqlPrisma(sql)
}

