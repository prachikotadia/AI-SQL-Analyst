/**
 * Query validation and typo correction utilities
 * Detects out-of-scope queries and corrects typos in column/table names
 */

import { fuzzyMatchName, fuzzyMatchSQL } from './fuzzyMatch'
import type { FileMetadata } from '@/lib/data/fileRegistry'

export interface QueryValidationResult {
  isValid: boolean
  isOutOfScope: boolean
  correctedQuery?: string
  correctedSql?: string
  suggestions?: string[]
  errorMessage?: string
  typoCorrections?: string[]
}

/**
 * Check if a query is asking about something not in the uploaded files
 */
export function isOutOfScopeQuery(
  userQuery: string,
  files: FileMetadata[]
): { isOutOfScope: boolean; reason?: string } {
  if (files.length === 0) {
    return { isOutOfScope: false } // Can't determine without files
  }

  const queryLower = userQuery.toLowerCase()
  
  // Collect all available columns and tables
  const allColumns = new Set<string>()
  const allTables = new Set<string>()
  
  files.forEach(file => {
    allTables.add(file.tableName.toLowerCase())
    file.columns.forEach(col => {
      allColumns.add(col.name.toLowerCase())
    })
  })

  // Common out-of-scope patterns
  const outOfScopePatterns = [
    // Asking about external data sources
    /\b(weather|temperature|forecast|climate)\b/i,
    /\b(stock|market|trading|nasdaq|s&p)\b/i,
    /\b(news|article|headline|media)\b/i,
    /\b(social media|facebook|twitter|instagram|linkedin)\b/i,
    /\b(email|message|notification|alert)\b/i,
    /\b(calendar|appointment|meeting|schedule)\b/i,
    /\b(google|amazon|microsoft|apple|company stock)\b/i,
    /\b(currency|exchange rate|bitcoin|crypto)\b/i,
    /\b(location|gps|coordinates|map|address)\b/i,
    /\b(time|clock|timezone|current time)\b/i,
  ]

  // Check for out-of-scope patterns
  for (const pattern of outOfScopePatterns) {
    if (pattern.test(userQuery)) {
      // But check if it might be in the data
      const match = userQuery.match(pattern)
      if (match) {
        const matchedTerm = match[0].toLowerCase()
        // Check if any column or table contains this term
        const foundInData = Array.from(allColumns).some(col => 
          col.includes(matchedTerm) || matchedTerm.includes(col)
        ) || Array.from(allTables).some(table => 
          table.includes(matchedTerm) || matchedTerm.includes(table)
        )
        
        if (!foundInData) {
          return {
            isOutOfScope: true,
            reason: `Your query mentions "${match[0]}", but this information is not available in the uploaded CSV/Excel files. Please ask questions about the data in your uploaded files.`,
          }
        }
      }
    }
  }

  // Check for queries that don't reference any columns/tables
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2)
  const hasRelevantTerm = queryWords.some(word => {
    return Array.from(allColumns).some(col => 
      col.includes(word) || word.includes(col) || 
      fuzzyMatchName(word, Array.from(allColumns)).score > 0.6
    ) || Array.from(allTables).some(table => 
      table.includes(word) || word.includes(table) ||
      fuzzyMatchName(word, Array.from(allTables)).score > 0.6
    )
  })

  // If query is very generic and doesn't reference any data, it might be out of scope
  const genericQueries = [
    'what is',
    'tell me about',
    'explain',
    'describe',
    'what are',
    'who is',
    'where is',
    'when is',
  ]

  const isGeneric = genericQueries.some(gq => queryLower.startsWith(gq))
  
  if (isGeneric && !hasRelevantTerm && queryWords.length < 5) {
    return {
      isOutOfScope: true,
      reason: 'Your query is too generic and doesn\'t reference any data from the uploaded files. Please ask specific questions about the data in your CSV/Excel files.',
    }
  }

  return { isOutOfScope: false }
}

/**
 * Correct typos in SQL query using fuzzy matching
 */
export function correctQueryTypos(
  sql: string,
  files: FileMetadata[]
): { correctedSql: string; corrections: string[] } {
  if (files.length === 0) {
    return { correctedSql: sql, corrections: [] }
  }

  const availableTables = files.map(f => f.tableName)
  const availableColumns: Record<string, string[]> = {}
  
  files.forEach(file => {
    availableColumns[file.tableName] = file.columns.map(c => c.name)
  })

  const result = fuzzyMatchSQL(sql, availableTables, availableColumns)
  
  return {
    correctedSql: result.sql,
    corrections: result.mappings,
  }
}

/**
 * Validate and correct a user query
 */
export function validateQuery(
  userQuery: string,
  sql: string,
  files: FileMetadata[]
): QueryValidationResult {
  // Check if query is out of scope
  const scopeCheck = isOutOfScopeQuery(userQuery, files)
  if (scopeCheck.isOutOfScope) {
    return {
      isValid: false,
      isOutOfScope: true,
      errorMessage: scopeCheck.reason || 'This query is not related to the uploaded data files.',
    }
  }

  // Correct typos in SQL
  if (sql && sql !== 'not_available') {
    const correctionResult = correctQueryTypos(sql, files)
    if (correctionResult.corrections.length > 0) {
      return {
        isValid: true,
        isOutOfScope: false,
        correctedSql: correctionResult.correctedSql,
        typoCorrections: correctionResult.corrections,
      }
    }
  }

  return {
    isValid: true,
    isOutOfScope: false,
  }
}
