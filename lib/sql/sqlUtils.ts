import { MAX_ROWS } from './validator'

export interface ValidationResult {
  valid: boolean
  error?: string
  tier?: number
  sanitizedSql?: string
  correctedSql?: string
}

/**
 * Sanitize SQL by adding LIMIT if missing
 * Handles edge cases: semicolons, subqueries, multiple statements
 * Properly handles SQL clause order: SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT
 */
export function sanitizeSql(sql: string): string {
  if (!sql || !sql.trim()) {
    return sql
  }

  // Only process SELECT queries - don't add LIMIT to CREATE, INSERT, UPDATE, DELETE, etc.
  const upperSql = sql.toUpperCase().trim()
  if (!upperSql.startsWith('SELECT')) {
    return sql.trim()
  }

  let sanitized = sql.trim()

  // Remove trailing semicolon for processing
  const hasTrailingSemicolon = sanitized.endsWith(';')
  if (hasTrailingSemicolon) {
    sanitized = sanitized.slice(0, -1).trim()
  }

  // Check if LIMIT already exists at the end of the main query (not in subqueries)
  // Use a more precise regex that looks for LIMIT at the very end
  const limitAtEndRegex = /\bLIMIT\s+\d+\s*$/i
  const hasLimit = limitAtEndRegex.test(sanitized)

  if (!hasLimit) {
    // Find where to insert LIMIT - must be after ORDER BY, or at the end
    // SQL clause order: SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT
    
    // Check for ORDER BY at the end
    const orderByAtEndRegex = /ORDER\s+BY\s+[^;]+$/i
    const orderByMatch = sanitized.match(orderByAtEndRegex)
    
    if (orderByMatch) {
      // Add LIMIT after ORDER BY
      sanitized = `${sanitized} LIMIT ${MAX_ROWS}`
    } else {
      // No ORDER BY, check for other clauses that might be at the end
      // Look for WHERE, GROUP BY, HAVING at the end
      const hasWhereAtEnd = /\bWHERE\s+[^;]+$/i.test(sanitized)
      const hasGroupByAtEnd = /\bGROUP\s+BY\s+[^;]+$/i.test(sanitized)
      const hasHavingAtEnd = /\bHAVING\s+[^;]+$/i.test(sanitized)
      
      if (hasWhereAtEnd || hasGroupByAtEnd || hasHavingAtEnd) {
        // Add LIMIT at the end
        sanitized = `${sanitized} LIMIT ${MAX_ROWS}`
      } else {
        // Simple query ending with FROM or just columns
        // Add LIMIT at the end
        sanitized = `${sanitized} LIMIT ${MAX_ROWS}`
      }
    }
  } else {
    // LIMIT exists, ensure it's within bounds
    const limitMatch = sanitized.match(/\bLIMIT\s+(\d+)\s*$/i)
    if (limitMatch) {
      const limitValue = parseInt(limitMatch[1], 10)
      if (limitValue > MAX_ROWS) {
        sanitized = sanitized.replace(/\bLIMIT\s+\d+\s*$/i, `LIMIT ${MAX_ROWS}`)
      }
    }
  }

  // Restore trailing semicolon if it was there originally
  if (hasTrailingSemicolon && !sanitized.endsWith(';')) {
    sanitized = `${sanitized};`
  }

  return sanitized
}

/**
 * Extract table names from SQL
 */
export function extractTableNames(sql: string): string[] {
  const fromMatches = sql.match(/\bFROM\s+(\w+)/gi) || []
  const joinMatches = sql.match(/\bJOIN\s+(\w+)/gi) || []
  
  return [...fromMatches, ...joinMatches]
    .map(m => {
      const match = m.match(/\b(\w+)$/i)
      return match ? match[1].toLowerCase() : null
    })
    .filter(Boolean) as string[]
}

/**
 * Extract column names from SELECT clause
 */
export function extractSelectColumns(sql: string): string[] {
  const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM/i)
  if (!selectMatch) return []

  const selectClause = selectMatch[1]
  // Simple extraction - split by comma and clean
  return selectClause
    .split(',')
    .map(col => {
      // Remove AS aliases and clean
      const cleaned = col.trim().replace(/\s+AS\s+\w+/i, '').trim()
      const match = cleaned.match(/(\w+)$/)
      return match ? match[1].toLowerCase() : null
    })
    .filter(Boolean) as string[]
}

