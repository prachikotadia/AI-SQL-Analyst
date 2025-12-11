/**
 * Validates SQL against known schema (tables and columns from uploaded files)
 * 
 * This parser normalizes Excel/CSV data so the query engine can treat everything consistently.
 * When files aren't found on disk (serverless reset), it recovers them from chatStore.
 */

import { getFilesByIds } from '@/lib/data/fileRegistry'
import { getChat, getChatFiles } from '@/lib/data/chatStore'

export interface ValidationResult {
  valid: boolean
  error?: string
  unknownTables?: string[]
  unknownColumns?: string[]
  correctedSql?: string
}

/**
 * Extract table names from SQL query
 * Handles subqueries, aliases, and window functions
 */
function extractTableNames(sql: string): string[] {
  const tables: string[] = []
  
  // Remove subqueries temporarily to avoid matching aliases as table names
  const subqueryPattern = /\(SELECT\s+[^)]+\)/gi
  let cleanedSql = sql
  const subqueries: string[] = []
  let subqueryIndex = 0
  cleanedSql = cleanedSql.replace(subqueryPattern, (match) => {
    subqueries.push(match)
    return `__SUBQUERY_${subqueryIndex++}__`
  })
  
  // Extract table names from outer query
  // Match FROM clause (case insensitive)
  // Handle: FROM table, FROM "table", FROM 'table', FROM table_123, FROM (subquery) alias
  const fromMatches = cleanedSql.matchAll(/FROM\s+(?:__SUBQUERY_\d+__|["']?([\w_]+)["']?)(?:\s+AS\s+(\w+))?/gi)
  for (const match of fromMatches) {
    if (match[1] && !match[1].startsWith('__SUBQUERY')) {
      tables.push(match[1])
    }
  }
  
  // Match JOIN clauses
  const joinMatches = cleanedSql.matchAll(/JOIN\s+["']?([\w_]+)["']?/gi)
  for (const match of joinMatches) {
    if (!match[1].startsWith('__SUBQUERY')) {
      tables.push(match[1])
    }
  }
  
  // Extract table names from subqueries recursively
  for (const subquery of subqueries) {
    const innerTables = extractTableNames(subquery.replace(/^\(|\)$/g, ''))
    tables.push(...innerTables)
  }
  
  return [...new Set(tables)] // Remove duplicates
}

/**
 * Extract column names from SQL query
 */
function extractColumnNames(sql: string): string[] {
  const columns: string[] = []
  
  // Remove window functions from SQL before extracting columns
  // Pattern: ROW_NUMBER() OVER (...) AS alias
  let cleanedSql = sql
  cleanedSql = cleanedSql.replace(/\bROW_NUMBER\s*\([^)]*\)\s+OVER\s*\([^)]+\)\s+AS\s+\w+/gi, '')
  cleanedSql = cleanedSql.replace(/\bRANK\s*\([^)]*\)\s+OVER\s*\([^)]+\)\s+AS\s+\w+/gi, '')
  cleanedSql = cleanedSql.replace(/\bDENSE_RANK\s*\([^)]*\)\s+OVER\s*\([^)]+\)\s+AS\s+\w+/gi, '')
  
  // Remove CAST expressions and replace with just the column name
  // Pattern: CAST("Price" AS DOUBLE PRECISION) -> "Price"
  // Handle: CAST("Price" AS DOUBLE PRECISION), CAST(Price AS DOUBLE PRECISION), CAST("Price" AS NUMERIC), etc.
  // Match the entire CAST expression and replace with just the column name
  cleanedSql = cleanedSql.replace(/CAST\s*\(\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1\s+AS\s+[A-Z\s]+\s*\)/gi, (match, quote, colName) => {
    // Extract the column name and preserve quotes if they were there
    return quote ? `"${colName}"` : colName
  })
  
  // Fallback: Handle CAST expressions where quotes don't match exactly
  // This handles cases like CAST("Price" AS ...) where the pattern might not match perfectly
  cleanedSql = cleanedSql.replace(/CAST\s*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s+AS\s+[A-Z\s]+\s*\)/gi, '"$1"')
  cleanedSql = cleanedSql.replace(/CAST\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s+AS\s+[A-Z\s]+\s*\)/gi, '$1')
  
  // Remove subquery aliases from WHERE clauses
  // Pattern: WHERE alias.column or WHERE rn <= 5
  cleanedSql = cleanedSql.replace(/WHERE\s+(\w+)\.(\w+)/gi, 'WHERE $2') // Remove table/alias prefix
  cleanedSql = cleanedSql.replace(/WHERE\s+(rn|row_num|rank|dense_rank)\s*[<>=]/gi, 'WHERE 1=1') // Remove window function alias conditions
  
  const sqlUpper = cleanedSql.toUpperCase()
  
  // SQL keywords to ignore
  const sqlKeywords = new Set([
    'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'INNER', 'LEFT', 'RIGHT', 'JOIN', 'ON',
    'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'AS', 'DISTINCT',
    'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'ASC', 'DESC', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'EXISTS',
    'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'OVER', 'PARTITION', 'WINDOW',
    'CAST', 'DOUBLE', 'PRECISION', 'INTEGER', 'FLOAT', 'NUMERIC', 'DECIMAL', 'VARCHAR', 'TEXT', 'BOOLEAN'
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
  const quotedMatches = cleanedSql.matchAll(/["']([^"']+)["']/g)
  for (const match of quotedMatches) {
    const matchIndex = match.index || 0
    const beforeMatch = sqlUpper.substring(Math.max(0, matchIndex - 20), matchIndex)
    
    // Skip if it's a string value (after =, IN, or in WHERE clause with value context)
    // Also skip if it's part of a CAST expression (should already be replaced, but double-check)
    const isValue = /=\s*$|IN\s*\(|WHERE\s+[^=]*=\s*$|VALUES\s*\(|'[^']*'$/.test(beforeMatch)
    const isInCast = /\bCAST\s*\(\s*$/i.test(beforeMatch)
    if (!isValue && !isInCast) {
      const colName = match[1]
      const colUpper = colName.toUpperCase()
      // Skip SQL keywords and only add if it's not a single character
      if (colName.length > 1 && !sqlKeywords.has(colUpper)) {
        columns.push(colName)
      }
    }
  }
  
  // Extract unquoted identifiers from SELECT clause
  const selectMatch = cleanedSql.match(/SELECT\s+(.+?)\s+FROM/is)
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
  const whereMatch = cleanedSql.match(/WHERE\s+(.+?)(?:\s+GROUP|\s+ORDER|\s+HAVING|\s*$)/is)
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
  const groupByMatch = cleanedSql.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER|\s+HAVING|\s*$)/is)
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
  
  const orderByMatch = cleanedSql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|\s*$)/is)
  if (orderByMatch) {
    const orderClause = orderByMatch[1]
    
    // Extract column names, skipping SQL keywords
    // CAST expressions should already be replaced above, but handle them explicitly here too
    const orderCols = orderClause.matchAll(/(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/gi)
    for (const match of orderCols) {
      const colName = match[2]
      const colUpper = colName.toUpperCase()
      
      // Skip SQL keywords (including CAST, DOUBLE, PRECISION, INTEGER, etc.)
      if (!sqlKeywords.has(colUpper) && colName.length > 1) {
        // Also check if this is part of a CAST expression that wasn't replaced
        const matchIndex = match.index || 0
        const beforeCol = orderClause.substring(Math.max(0, matchIndex - 10), matchIndex)
        const hasCastBefore = /\bCAST\s*\(\s*$/i.test(beforeCol)
        if (!hasCastBefore) {
          columns.push(colName)
        }
      }
    }
  }
  
  return [...new Set(columns)] // Remove duplicates
}

/**
 * Validate SQL against schema from uploaded files
 * CRITICAL: If fileRegistry is empty (serverless reset), recovers files from chatStore
 */
export function validateSqlAgainstSchema(
  sql: string,
  fileIds: string[],
  chatId?: string
): ValidationResult {
  let files = getFilesByIds(fileIds)
  
  // CRITICAL FIX: If disk storage is empty but we have fileIds, try to recover from chatStore
  // This should rarely happen since files are now saved to disk, but it's a safety net
  if (files.length === 0 && fileIds.length > 0 && chatId) {
    try {
      const chat = getChat(chatId)
      if (chat) {
        const chatFiles = getChatFiles(chat.chatId)
        // Filter to only files that match our fileIds
        const matchingFiles = chatFiles.filter(f => fileIds.includes(f.id))
        if (matchingFiles.length > 0) {
          files = matchingFiles
          
          // Re-save to disk so they persist
          try {
            const { reRegisterFile } = require('@/lib/data/fileRegistry')
            for (const file of matchingFiles) {
              reRegisterFile(file)
            }
          } catch (regError) {
            // Could not re-save files to disk, continue with chatStore files
          }
        }
      }
    } catch (error) {
      // Failed to recover files from chatStore
    }
  }
  
  if (files.length === 0) {
    // CRITICAL: If we have fileIds but no files, try one more recovery attempt
    if (fileIds.length > 0 && chatId) {
      try {
        const chat = getChat(chatId)
        if (chat) {
          const chatFiles = getChatFiles(chat.chatId)
          // Use ALL chat files if IDs don't match (fallback)
          if (chatFiles.length > 0) {
            files = chatFiles
            
            // Re-register to disk storage
            try {
              const { reRegisterFile } = require('@/lib/data/fileRegistry')
              for (const file of chatFiles) {
                reRegisterFile(file)
              }
            } catch (regError) {
              // Could not re-save files to disk, continue with chatStore files
            }
          }
        }
      } catch (error) {
        // Final recovery attempt failed
      }
    }
    
    if (files.length === 0) {
      return {
        valid: false,
        error: 'No files attached to validate against. Please ensure files are uploaded and attached to this chat.',
      }
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

  // Extract window function aliases and subquery aliases to ignore
  const aliasPatterns = [
    /\bROW_NUMBER\s*\([^)]*\)\s+OVER\s*\([^)]+\)\s+AS\s+(\w+)/gi, // ROW_NUMBER() OVER (...) AS alias
    /FROM\s+\([^)]+\)\s+AS\s+(\w+)/gi, // FROM (subquery) AS alias
    /FROM\s+\([^)]+\)\s+(\w+)/gi, // FROM (subquery) alias (without AS)
  ]
  
  const validAliases = new Set<string>()
  for (const pattern of aliasPatterns) {
    const matches = sql.matchAll(pattern)
    for (const match of matches) {
      if (match[1]) {
        validAliases.add(match[1].toLowerCase())
      }
    }
  }

  const unknownTables: string[] = []
  const unknownColumns: string[] = []

  // Check tables
  for (const table of sqlTables) {
    if (!validTables.has(table.toLowerCase())) {
      unknownTables.push(table)
    }
  }

  // Check columns (case-insensitive)
  // Ignore window function aliases and subquery aliases
  for (const col of sqlColumns) {
    const colLower = col.toLowerCase()
    
    // Skip if it's a known alias from window functions or subqueries
    if (validAliases.has(colLower)) {
      continue
    }
    
    // Skip common alias names that might be from window functions
    if (['rn', 'row_num', 'rank', 'dense_rank'].includes(colLower)) {
      continue
    }
    
    let found = false
    for (const [tableKey, columns] of validColumns.entries()) {
      if (columns.has(colLower)) {
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

