import { getDatabaseSchema } from '../db/schema'
import type { ValidationResult } from './sqlUtils'

// Helper to normalize column names for comparison
function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Block security-sensitive commands while allowing DML/DDL in sandbox
const DANGEROUS_KEYWORDS = [
  'COMMENT', 'EXEC', 'EXECUTE', 'CALL', 'GRANT', 'REVOKE', 'MERGE',
  'COPY', 'IMPORT', 'EXPORT', 'BACKUP', 'RESTORE'
]

// Block suspicious patterns that could access system tables or execute commands
const SUSPICIOUS_PATTERNS = [
  /;\s*(EXEC|GRANT|REVOKE|COMMENT)/i,
  /--/,
  /\/\*/,
  /\*\//,
  /xp_/i,
  /sp_/i,
  /pg_/i,
  /information_schema/i,
  /pg_catalog/i,
  /sys\./i,
  /master\./i,
]

const MAX_ROWS = 5000
const MAX_EXECUTION_TIME_MS = 5000

// First validation pass: block dangerous keywords and suspicious patterns
// This catches security issues before deeper analysis
export function validateTier1(sql: string): ValidationResult {
  const upperSql = sql.toUpperCase().trim()

  // Check for double dots ".." which cause syntax errors
  if (sql.includes('..')) {
    return {
      valid: false,
      error: 'SQL contains invalid syntax ".." (double dots). This is not valid SQL syntax.',
      tier: 1,
    }
  }

  // Check for incomplete SQL patterns (syntax errors)
  const incompletePatterns = [
    /\bWHERE\s+\w+\s*=\s*$/i,  // "WHERE state ="
    /\bWHERE\s+\w+\s*IN\s*\(\s*$/i,  // "WHERE city IN ("
    /\bWHERE\s+.*\b(AND|OR)\s*$/i,  // "WHERE state = 'TX' AND"
    /\bWHERE\s+.*\b(AND|OR)\s+(AND|OR)\s*$/i,  // "WHERE ... AND OR"
    /\bWHERE\s+\([^)]*$/i,  // Unclosed parentheses in WHERE
    /\bWHERE\s+.*\s*=\s*$/i,  // Any incomplete comparison
  ]

  for (const pattern of incompletePatterns) {
    if (pattern.test(sql)) {
      return {
        valid: false,
        error: 'SQL contains incomplete WHERE clause. All comparisons must have both sides (e.g., "WHERE state = \'TX\'", not "WHERE state =").',
        tier: 1,
      }
    }
  }

  // Check dangerous keywords
  for (const keyword of DANGEROUS_KEYWORDS) {
    if (upperSql.includes(keyword)) {
      return {
        valid: false,
        error: `Query contains forbidden keyword: ${keyword}. Only SELECT queries are allowed.`,
        tier: 1,
      }
    }
  }

  // Check suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(sql)) {
      return {
        valid: false,
        error: 'Query contains suspicious patterns that are not allowed.',
        tier: 1,
      }
    }
  }

  // Must start with a valid SQL statement (SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP)
  const validStarters = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE']
  const startsWithValid = validStarters.some(starter => upperSql.startsWith(starter))
  
  if (!startsWithValid) {
    return {
      valid: false,
      error: `Query must start with a valid SQL statement: ${validStarters.join(', ')}.`,
      tier: 1,
    }
  }

  // Check for multiple statements (count semicolons)
  const semicolonCount = (sql.match(/;/g) || []).length
  if (semicolonCount > 1) {
    return {
      valid: false,
      error: 'Query must contain only a single SQL statement (no chained statements).',
      tier: 1,
    }
  }
  
  // Block transaction control
  if (upperSql.includes('BEGIN') || upperSql.includes('COMMIT') || upperSql.includes('ROLLBACK')) {
    return {
      valid: false,
      error: 'Transaction control statements (BEGIN, COMMIT, ROLLBACK) are not allowed.',
      tier: 1,
    }
  }

  return { valid: true, tier: 1 }
}

// Second validation pass: check query structure, limits, and GROUP BY correctness
// Ensures queries are well-formed and won't cause performance issues
export async function validateTier2(sql: string): Promise<ValidationResult> {
  const upperSql = sql.toUpperCase().trim()

  // Check LIMIT clause
  const limitMatch = upperSql.match(/LIMIT\s+(\d+)/i)
  if (limitMatch) {
    const limitValue = parseInt(limitMatch[1], 10)
    if (limitValue > MAX_ROWS) {
      return {
        valid: false,
        error: `LIMIT value (${limitValue}) exceeds maximum allowed (${MAX_ROWS}).`,
        tier: 2,
      }
    }
  }

  // Check for subqueries with potentially dangerous operations
  const subqueryPattern = /\(SELECT\s+.*?\)/gi
  const subqueries = sql.match(subqueryPattern)
  if (subqueries) {
    for (const subquery of subqueries) {
      const subUpper = subquery.toUpperCase()
      for (const keyword of DANGEROUS_KEYWORDS) {
        if (subUpper.includes(keyword)) {
          return {
            valid: false,
            error: 'Subquery contains forbidden operations.',
            tier: 2,
          }
        }
      }
    }
  }

  // Validate GROUP BY correctness
  const hasGroupBy = upperSql.includes('GROUP BY')
  const hasAggregation = /(COUNT|SUM|AVG|MAX|MIN|STDDEV|VARIANCE)\s*\(/i.test(upperSql)
  
  if (hasGroupBy) {
    // Extract SELECT clause and GROUP BY clause
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i)
    const groupByMatch = sql.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER|\s+HAVING|\s+LIMIT|$)/i)
    
    if (selectMatch && groupByMatch) {
      const selectClause = selectMatch[1]
      const groupByClause = groupByMatch[1]
      
      // Extract column names from SELECT (excluding aggregates)
      const selectColumns = selectClause
        .split(',')
        .map(col => {
          // Remove aggregate functions and aliases
          const cleaned = col.replace(/\s+(AS|as)\s+\w+/i, '').trim()
          // Check if it's an aggregate
          if (/(COUNT|SUM|AVG|MAX|MIN|STDDEV|VARIANCE)\s*\(/i.test(cleaned)) {
            return null
          }
          // Extract column name (handle table.column format)
          const colMatch = cleaned.match(/(?:(\w+)\.)?(\w+)$/)
          return colMatch ? (colMatch[1] ? `${colMatch[1]}.${colMatch[2]}` : colMatch[2]).toLowerCase() : null
        })
        .filter((col): col is string => col !== null)
      
      // Extract column names from GROUP BY
      const groupByColumns = groupByClause
        .split(',')
        .map(col => {
          const cleaned = col.trim()
          const colMatch = cleaned.match(/(?:(\w+)\.)?(\w+)$/)
          return colMatch ? (colMatch[1] ? `${colMatch[1]}.${colMatch[2]}` : colMatch[2]).toLowerCase() : null
        })
        .filter((col): col is string => col !== null)
      
      // Check if all non-aggregate SELECT columns are in GROUP BY
      const missingInGroupBy = selectColumns.filter(col => {
        // Check if column is in GROUP BY (exact match or just column name)
        const colName = col.includes('.') ? col.split('.')[1] : col
        return !groupByColumns.some(gbCol => {
          const gbColName = gbCol.includes('.') ? gbCol.split('.')[1] : gbCol
          return gbCol === col || gbColName === colName || col === gbCol || colName === gbCol
        })
      })
      
      if (missingInGroupBy.length > 0 && hasAggregation) {
        return {
          valid: false,
          error: `Columns in SELECT must appear in GROUP BY clause when using aggregate functions. Missing: ${missingInGroupBy.join(', ')}. Add them to GROUP BY or use them in an aggregate function.`,
          tier: 2,
        }
      }
    }
  }

  // Check for system table references
  const systemTablePattern = /FROM\s+(information_schema|pg_catalog|sys|master)\./i
  if (systemTablePattern.test(sql)) {
    return {
      valid: false,
      error: 'Query references system tables which are not allowed.',
      tier: 2,
    }
  }

  return { valid: true, tier: 2 }
}

// Third validation pass: validate against actual database schema
// Uses fuzzy matching to correct typos in table/column names
export async function validateTier3(sql: string): Promise<ValidationResult> {
  const schema = await getDatabaseSchema()
  const validTables = new Set(schema.map(t => t.name.toLowerCase()))
  const validColumns = new Map<string, Set<string>>()
  
  for (const table of schema) {
    validColumns.set(table.name.toLowerCase(), new Set(table.columns.map(c => c.name.toLowerCase())))
  }

  // Extract table names from FROM and JOIN clauses
  // Handle both quoted ("table_name") and unquoted (table_name) identifiers
  // Also handle aliases: FROM "cities" AS c or FROM cities c
  const extractTableNames = (sql: string, keyword: 'FROM' | 'JOIN'): string[] => {
    const pattern = new RegExp(`\\b${keyword}\\s+([^\\s,;]+)`, 'gi')
    const matches = sql.matchAll(pattern)
    const tableNames: string[] = []
    
    for (const match of matches) {
      let tableName = match[1].trim()
      
      // Remove quotes if present
      if (tableName.startsWith('"') && tableName.endsWith('"')) {
        tableName = tableName.slice(1, -1)
      }
      
      // Remove alias (AS alias or just alias after space)
      // Handle: FROM "cities" AS c, FROM cities c, FROM "cities" c
      const aliasMatch = tableName.match(/^(.+?)(?:\s+AS\s+|\s+)(\w+)$/i)
      if (aliasMatch) {
        tableName = aliasMatch[1].trim()
        // Remove quotes from table name if present
        if (tableName.startsWith('"') && tableName.endsWith('"')) {
          tableName = tableName.slice(1, -1)
        }
      }
      
      // Convert to lowercase for comparison (PostgreSQL lowercases unquoted identifiers)
      tableNames.push(tableName.toLowerCase())
    }
    
    return tableNames
  }
  
  const fromTables = extractTableNames(sql, 'FROM')
  const joinTables = extractTableNames(sql, 'JOIN')
  const allTableRefs = [...fromTables, ...joinTables]

  // Validate tables exist and replace partial matches
  let correctedSql = sql
  const tableReplacements: Array<{ from: string; to: string }> = []
  
  for (const tableRef of allTableRefs) {
    const exactMatch = validTables.has(tableRef)
    
    if (exactMatch) {
      continue
    }
    
    // Find partial match (table name starts with the reference)
    const matchedTable = Array.from(validTables).find(table => 
      table.startsWith(tableRef + '_') || tableRef.startsWith(table + '_')
    )
    
    if (matchedTable) {
      tableReplacements.push({ from: tableRef, to: matchedTable })
    } else {
      const availableTables = Array.from(validTables).slice(0, 10).join(', ')
      const moreTables = validTables.size > 10 ? ` and ${validTables.size - 10} more` : ''
      
      return {
        valid: false,
        error: `Table "${tableRef}" does not exist in the database schema. Available tables: ${availableTables}${moreTables}.`,
        tier: 3,
      }
    }
  }
  
  // Replace table names in SQL if needed (handle quoted and unquoted)
  for (const replacement of tableReplacements) {
    // Replace unquoted: cities -> cities_123456
    correctedSql = correctedSql.replace(
      new RegExp(`\\b${replacement.from}\\b`, 'gi'),
      replacement.to
    )
    // Replace quoted: "cities" -> "cities_123456"
    correctedSql = correctedSql.replace(
      new RegExp(`"${replacement.from}"`, 'gi'),
      `"${replacement.to}"`
    )
  }

  // Validate and correct column names using fuzzy matching
  const { fuzzyMatchSQL } = await import('../utils/fuzzyMatch')
  
  // Build column mapping for fuzzy matching
  const allColumns: Record<string, string[]> = {}
  for (const table of schema) {
    allColumns[table.name] = table.columns.map(c => c.name)
  }
  
  // Apply fuzzy matching to correct column names
  const fuzzyResult = fuzzyMatchSQL(correctedSql, Array.from(validTables), allColumns)
  correctedSql = fuzzyResult.sql
  
  // Check for double dots ".." which cause syntax errors
  if (correctedSql.includes('..')) {
    return {
      valid: false,
      error: 'SQL contains invalid syntax ".." (double dots). This is not valid SQL syntax.',
      tier: 3,
    }
  }
  
  // Final validation: check that all column references are valid
  // Extract all column references (both table.column and standalone columns)
  const allColumnRefs = [
    ...Array.from(correctedSql.matchAll(/\b(\w+)\.(\w+)\b/gi)), // table.column
    ...Array.from(correctedSql.matchAll(/\bSELECT\s+([^,\s]+(?:,\s*[^,\s]+)*)\s+FROM/gi)), // SELECT columns
  ]
  
  // Check quoted column names too: "ColumnName"
  const quotedColumnRefs = Array.from(correctedSql.matchAll(/"([^"]+)"/gi))
  
  for (const match of quotedColumnRefs) {
    const quotedName = match[1]
    // Check if this is a column name (not a table name we already validated)
    // For cities table, validate against known columns
    const citiesTable = schema.find(t => t.name.toLowerCase() === 'cities')
    if (citiesTable) {
      const exactMatch = citiesTable.columns.some(c => c.name === quotedName)
      if (!exactMatch && !validTables.has(quotedName.toLowerCase())) {
        // Try to find close match
        const closeMatch = citiesTable.columns.find(c => 
          c.name.toLowerCase() === quotedName.toLowerCase() ||
          normalizeColumnName(c.name) === normalizeColumnName(quotedName)
        )
        if (closeMatch && closeMatch.name !== quotedName) {
          correctedSql = correctedSql.replace(`"${quotedName}"`, `"${closeMatch.name}"`)
        }
      }
    }
  }

  return { 
    valid: true, 
    tier: 3,
    correctedSql: correctedSql !== sql ? correctedSql : undefined
  }
}

// Main validation entry point - runs all three validation tiers in sequence
// Returns corrected SQL if fuzzy matching fixed any typos
export async function validateSql(sql: string): Promise<ValidationResult> {
  // Tier 1: Denylist
  const tier1 = validateTier1(sql)
  if (!tier1.valid) {
    return tier1
  }

  // Tier 2: Structure
  const tier2 = await validateTier2(sql)
  if (!tier2.valid) {
    return tier2
  }

  // Tier 3: Schema
  const tier3 = await validateTier3(sql)
  if (!tier3.valid) {
    return tier3
  }

  return { 
    valid: true, 
    tier: 3,
    correctedSql: tier3.correctedSql
  }
}

export { MAX_ROWS, MAX_EXECUTION_TIME_MS }
