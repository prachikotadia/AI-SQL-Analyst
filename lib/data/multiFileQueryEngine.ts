/**
 * Multi-file in-memory query engine
 * 
 * Executes SQL queries against multiple attached files. Currently supports single-file queries
 * (uses first file). The engine normalizes data types so numeric columns sort correctly.
 */

import { getFilesByIds, type FileMetadata } from './fileRegistry'
import { executeInMemoryQuery } from './queryEngine'
import type { SessionData } from './inMemoryStore'

export interface MultiFileQueryResult {
  data: Record<string, any>[]
  columns: Array<{ name: string; type: string }>
  error?: string
}

/**
 * Execute query against multiple files
 * Currently supports single-file queries (uses first file)
 */
export function executeMultiFileQuery(
  sql: string,
  fileIds: string[]
): MultiFileQueryResult {
  const files = getFilesByIds(fileIds)

  if (files.length === 0) {
    return {
      data: [],
      columns: [],
      error: 'No files attached to this query',
    }
  }

  const firstFile = files[0]
  
  if (!firstFile) {
    return {
      data: [],
      columns: [],
      error: 'No valid file found',
    }
  }

  if (!firstFile.data || !Array.isArray(firstFile.data)) {
    return {
      data: [],
      columns: [],
      error: 'File data is invalid or empty',
    }
  }
  
  // Convert FileMetadata to SessionData format
  const sessionData: SessionData = {
    sessionId: firstFile.id,
    fileName: firstFile.fileName,
    tableName: firstFile.tableName,
    columns: firstFile.columns || [],
    data: firstFile.data,
    uploadedAt: typeof firstFile.uploadedAt === 'string' ? new Date(firstFile.uploadedAt) : firstFile.uploadedAt,
  }

  // Replace table name in SQL with actual table name
  const sqlWithTableName = sql.replace(/FROM\s+[\w"]+/i, `FROM ${firstFile.tableName}`)

  let result
  try {
    result = executeInMemoryQuery(sqlWithTableName, sessionData)
  } catch (error: any) {
    return {
      data: [],
      columns: [],
      error: `Query execution failed: ${error.message || 'Unknown error'}`,
    }
  }

  if (result.error) {
    return {
      data: [],
      columns: [],
      error: result.error,
    }
  }

  // Convert column names to ColumnMetadata format
  // Handle case-insensitive matching
  const columns = result.columns.map(name => {
    const col = firstFile.columns.find(c => 
      c.name.toLowerCase() === name.toLowerCase() || c.name === name
    )
    return {
      name: col?.name || name,
      type: col?.type || 'text',
    }
  })

  // For SELECT *, preserve original row structure
  // For specific column selects, map to column names
  const sqlUpper = sqlWithTableName.toUpperCase()
  const isSelectStar = sqlUpper.includes('SELECT *')
  
  if (isSelectStar && result.data.length > 0) {
    // Use actual row keys as column names for SELECT *
    const firstRow = result.data[0]
    if (firstRow) {
      const actualRowKeys = Object.keys(firstRow)
      const actualColumns = actualRowKeys.map(key => {
        const col = firstFile.columns.find(c => c.name.toLowerCase() === key.toLowerCase())
        return {
          name: col?.name || key,
          type: col?.type || 'text',
        }
      })
      
      return {
        data: result.data, // Return data as-is for SELECT *
        columns: actualColumns,
      }
    }
  }

  // For specific column selects, map row keys to column names
  const dataWithValues = result.data.map(row => {
    const rowKeys = Object.keys(row)
    const newRow: Record<string, any> = {}
    
    // For each column, find the matching row key (case-insensitive)
    for (const col of columns) {
      // Try exact match first
      if (row[col.name] !== undefined) {
        newRow[col.name] = row[col.name]
      } else {
        // Try case-insensitive match
        const rowKey = rowKeys.find(k => k.toLowerCase() === col.name.toLowerCase())
        if (rowKey) {
          newRow[col.name] = row[rowKey]
        } else {
          // Check if column name exists in row (might be an alias)
          newRow[col.name] = row[col.name] ?? null
        }
      }
    }
    
    return newRow
  })

  return {
    data: dataWithValues,
    columns,
  }
}

