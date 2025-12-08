/**
 * Validates SQL against known schema (tables and columns from uploaded files)
 */

import { getFilesByIds } from '@/lib/data/fileRegistry'

export interface ValidationResult {
  valid: boolean
  error?: string
  unknownTables?: string[]
  unknownColumns?: string[]
  correctedSql?: string
}

/**
 * Extract table names from SQL query
 */
function extractTableNames(sql: string): string[] {
  const tables: string[] = []
  // Match FROM clause (case insensitive)
  // Handle: FROM table, FROM "table", FROM 'table', FROM table_123
  const fromMatch = sql.match(/FROM\s+["']?([\w_]+)["']?/i)
  if (fromMatch) {
    tables.push(fromMatch[1])
  }
  // Match JOIN clauses
  const joinMatches = sql.matchAll(/JOIN\s+["']?([\w_]+)["']?/gi)
  for (const match of joinMatches) {
    tables.push(match[1])
  }
  return tables
}

/**
 * Extract column names from SQL query
 */
function extractColumnNames(sql: string): string[] {
  const columns: string[] = []
  const sqlUpper = sql.toUpperCase()
  
  // SQL keywords to ignore
  const sqlKeywords = new Set([
    'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'INNER', 'LEFT', 'RIGHT', 'JOIN', 'ON',
    'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'AS', 'DISTINCT',
    'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'ASC', 'DESC', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'EXISTS'
  ])
  
  // Check if a string is a prefix of any SQL keyword (to avoid matching "CAS" from "CASE", etc.)
  function isKeywordPrefix(str: string): boolean {
    const upper = str.toUpperCase()
    for (const keyword of sqlKeywords) {
      if (keyword.startsWith(upper) && upper.length < keyword.length) {
        return true
      }
    }
    return false
  }
  
  // Extract quoted identifiers (quoted column names)
  const quotedMatches = sql.matchAll(/["']([^"']+)["']/g)
  for (const match of quotedMatches) {
    const matchIndex = match.index || 0
    const beforeMatch = sqlUpper.substring(Math.max(0, matchIndex - 20), matchIndex)
    
    // Skip if it's a string value (after =, IN, or in WHERE clause with value context)
    const isValue = /=\s*$|IN\s*\(|WHERE\s+[^=]*=\s*$|VALUES\s*\(|'[^']*'$/.test(beforeMatch)
    if (!isValue) {
      const colName = match[1]
      // Only add if it's not a single character (likely a typo or value)
      if (colName.length > 1) {
        columns.push(colName)
      }
    }
  }
  
  // Extract unquoted identifiers from SELECT clause
  const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/is)
  if (selectMatch) {
    const selectClause = selectMatch[1]
    // Split by comma and process each column
    const parts = selectClause.split(',').map(p => p.trim())
    for (const part of parts) {
      // Remove AS aliases
      const withoutAlias = part.replace(/\s+AS\s+\w+/i, '').trim()
      // Extract column name (before any function call)
      const colMatch = withoutAlias.match(/^["']?([A-Za-z_][A-Za-z0-9_]*)["']?|\(["']?([A-Za-z_][A-Za-z0-9_]*)["']?\)/)
      if (colMatch) {
        const colName = colMatch[1] || colMatch[2]
        if (colName) {
          const colUpper = colName.toUpperCase()
          // Skip SQL functions, keywords, and single characters
          if (!sqlKeywords.has(colUpper) && colName.length > 1) {
            columns.push(colName)
          }
        }
      }
    }
  }
  
  // Extract from WHERE clause (carefully handle CASE expressions)
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+GROUP|\s+ORDER|\s+HAVING|\s*$)/is)
  if (whereMatch) {
    const whereClause = whereMatch[1]
    
    // Remove CASE ... END expressions to avoid matching keywords inside them
    // Replace CASE ... END with a placeholder
    let cleanedClause = whereClause
    const casePattern = /CASE\s+WHEN[^E]*END/gi
    cleanedClause = cleanedClause.replace(casePattern, 'CASE_EXPRESSION')
    
    // Match column names before operators (but not values)
    // Pattern: column name followed by =, <, >, <=, >=, !=, IN, LIKE, BETWEEN, etc.
    // But exclude if it's part of a SQL keyword
    const whereCols = cleanedClause.matchAll(/(?:^|\s|\()(["']?)([A-Za-z_][A-Za-z0-9_]{2,})\1(?=\s*[=<>!]|\s+IN\s*\(|\s+LIKE\s+|\s+BETWEEN\s+)/gi)
    for (const match of whereCols) {
      const colName = match[2]
      const colUpper = colName.toUpperCase()
      
      // Skip if it's a SQL keyword or a prefix of a keyword
      const isKeyword = sqlKeywords.has(colUpper) || isKeywordPrefix(colName)
      
      if (!isKeyword && colName.length > 1) {
        columns.push(colName)
      }
    }
    
    // Extract quoted column names from CASE expressions (they're valid column references)
    const quotedInCase = whereClause.matchAll(/CASE\s+WHEN\s+["']([A-Za-z_][A-Za-z0-9_]+)["']/gi)
    for (const match of quotedInCase) {
      const colName = match[1]
      if (colName.length > 1 && !sqlKeywords.has(colName.toUpperCase())) {
        columns.push(colName)
      }
    }
  }
  
  // Extract from GROUP BY and ORDER BY
  const groupByMatch = sql.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER|\s+HAVING|\s*$)/is)
  if (groupByMatch) {
    const groupClause = groupByMatch[1]
    const groupCols = groupClause.matchAll(/(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/gi)
    for (const match of groupCols) {
      const colName = match[2]
      if (colName.length > 1) {
        columns.push(colName)
      }
    }
  }
  
  const orderByMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|\s*$)/is)
  if (orderByMatch) {
    const orderClause = orderByMatch[1]
    const orderCols = orderClause.matchAll(/(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/gi)
    for (const match of orderCols) {
      const colName = match[2]
      const colUpper = colName.toUpperCase()
      if (!sqlKeywords.has(colUpper) && colName.length > 1) {
        columns.push(colName)
      }
    }
  }
  
  return [...new Set(columns)] // Remove duplicates
}

/**
 * Validate SQL against schema from uploaded files
 */
export function validateSqlAgainstSchema(
  sql: string,
  fileIds: string[]
): ValidationResult {
  const files = getFilesByIds(fileIds)
  
  if (files.length === 0) {
    return {
      valid: false,
      error: 'No files attached to validate against',
    }
  }

  // Build map of valid table names and columns
  const validTables = new Set(files.map(f => f.tableName.toLowerCase()))
  const validColumns = new Map<string, Set<string>>() // table -> columns
  
  files.forEach(file => {
    const tableKey = file.tableName.toLowerCase()
    const columns = new Set(file.columns.map(c => c.name.toLowerCase()))
    validColumns.set(tableKey, columns)
  })

  // Extract tables and columns from SQL
  const sqlTables = extractTableNames(sql)
  const sqlColumns = extractColumnNames(sql)

  const unknownTables: string[] = []
  const unknownColumns: string[] = []

  // Check tables
  for (const table of sqlTables) {
    if (!validTables.has(table.toLowerCase())) {
      unknownTables.push(table)
    }
  }

  // Check columns (case-insensitive)
  for (const col of sqlColumns) {
    let found = false
    for (const [tableKey, columns] of validColumns.entries()) {
      if (columns.has(col.toLowerCase())) {
        found = true
        break
      }
    }
    if (!found) {
      unknownColumns.push(col)
    }
  }

  if (unknownTables.length > 0 || unknownColumns.length > 0) {
    const availableTables = Array.from(validTables).join(', ')
    const availableColumns = Array.from(validColumns.values())
      .flatMap(cols => Array.from(cols))
      .join(', ')
    
    return {
      valid: false,
      error: `SQL uses unknown tables/columns. Unknown tables: ${unknownTables.join(', ') || 'none'}. Unknown columns: ${unknownColumns.join(', ') || 'none'}. Available tables: ${availableTables}. Available columns: ${availableColumns}`,
      unknownTables,
      unknownColumns,
    }
  }

  return { valid: true }
}

