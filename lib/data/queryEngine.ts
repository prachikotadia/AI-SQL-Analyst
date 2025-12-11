/**
 * In-memory SQL query engine
 * Executes SQL SELECT queries against in-memory data arrays
 * Supports basic SELECT, WHERE, ORDER BY, LIMIT, and aggregations
 */

import type { SessionData } from './inMemoryStore'

export interface QueryResult {
  data: Record<string, any>[]
  columns: string[]
  error?: string
}

// Execute SQL query against in-memory data
export function executeInMemoryQuery(sql: string, sessionData: SessionData): QueryResult {
  try {
    // Clean SQL
    let cleanSql = sql.trim()
    if (cleanSql.endsWith(';')) {
      cleanSql = cleanSql.slice(0, -1).trim()
}

    // Parse basic SELECT query
    const selectMatch = cleanSql.match(/SELECT\s+(.+?)\s+FROM\s+([^\s]+)/i)
    if (!selectMatch) {
      return {
        data: [],
        columns: [],
        error: 'Invalid SQL: must be a SELECT statement',
      }
    }

    const selectClause = selectMatch[1].trim()
    const tableName = selectMatch[2].trim().replace(/["']/g, '')

    // Verify table name matches
    if (tableName.toLowerCase() !== sessionData.tableName.toLowerCase()) {
      return {
        data: [],
        columns: [],
        error: `Table "${tableName}" not found. Available table: "${sessionData.tableName}"`,
      }
    }

    let result = [...sessionData.data]
    
    // Parse WHERE clause
    const whereMatch = cleanSql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+GROUP|\s+LIMIT|$)/i)
    if (whereMatch) {
      const whereClause = whereMatch[1].trim()
      result = applyWhere(result, whereClause, sessionData.columns)
    }

    // Parse GROUP BY
    const groupByMatch = cleanSql.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i)
    if (groupByMatch) {
      const groupByColumns = groupByMatch[1].split(',').map(c => c.trim().replace(/["']/g, ''))
      result = applyGroupBy(result, selectClause, groupByColumns, sessionData.columns)
    }

    // Parse ORDER BY
    const orderByMatch = cleanSql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i)
    if (orderByMatch) {
      const orderClause = orderByMatch[1].trim()
      result = applyOrderBy(result, orderClause, sessionData.columns)
        }
        
    // Parse LIMIT
    const limitMatch = cleanSql.match(/LIMIT\s+(\d+)/i)
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10)
      result = result.slice(0, limit)
    }

    // Handle SELECT clause
    const columns = parseSelectColumns(selectClause, result, sessionData.columns)

    // Apply SELECT projection
    if (selectClause !== '*') {
      result = result.map(row => {
        const projected: Record<string, any> = {}
        for (const col of columns) {
          projected[col] = row[col] ?? null
          }
        return projected
    })
    }

    return {
      data: result,
      columns,
    }
  } catch (error: any) {
    return {
      data: [],
      columns: [],
      error: error.message || 'Query execution failed',
    }
  }
}

function parseSelectColumns(selectClause: string, data: Record<string, any>[], schemaColumns: Array<{ name: string; type: string }>): string[] {
  if (selectClause === '*') {
    return schemaColumns.map(c => c.name)
  }

  // Handle aggregations
  if (selectClause.match(/(COUNT|SUM|AVG|MAX|MIN)\s*\(/i)) {
    return [selectClause.split('(')[0].trim().toLowerCase()]
    }
    
  // Parse column list
  const columns = selectClause
    .split(',')
    .map(col => {
      // Remove AS alias if present
      const aliasMatch = col.match(/\s+AS\s+(\w+)/i)
      if (aliasMatch) {
        return aliasMatch[1]
      }
      // Extract column name (handle "column" or column)
      const colMatch = col.match(/["']?(\w+)["']?/)
      return colMatch ? colMatch[1] : col.trim()
    })
    .filter(Boolean)

  return columns.length > 0 ? columns : schemaColumns.map(c => c.name)
}

function applyWhere(data: Record<string, any>[], whereClause: string, schemaColumns: Array<{ name: string; type: string }>): Record<string, any>[] {
  // Simple WHERE clause parser - handles basic comparisons
  const conditions = whereClause.split(/\s+AND\s+|\s+OR\s+/i)
  
  return data.filter(row => {
    return conditions.every(condition => {
      // Handle =, !=, <, >, <=, >=, LIKE, IN
      if (condition.includes('=') && !condition.includes('!=') && !condition.includes('<=') && !condition.includes('>=')) {
        const [col, value] = condition.split('=').map(s => s.trim())
        const colName = col.replace(/["']/g, '')
        const val = value.replace(/["']/g, '').replace(/;$/, '')
        return String(row[colName] ?? '').toLowerCase() === val.toLowerCase()
      }
      if (condition.includes('!=')) {
        const [col, value] = condition.split('!=').map(s => s.trim())
        const colName = col.replace(/["']/g, '')
        const val = value.replace(/["']/g, '').replace(/;$/, '')
        return String(row[colName] ?? '').toLowerCase() !== val.toLowerCase()
      }
      if (condition.includes('>=')) {
        const [col, value] = condition.split('>=').map(s => s.trim())
        const colName = col.replace(/["']/g, '')
        const val = parseFloat(value.replace(/["']/g, ''))
        return parseFloat(row[colName] ?? 0) >= val
      }
      if (condition.includes('<=')) {
        const [col, value] = condition.split('<=').map(s => s.trim())
        const colName = col.replace(/["']/g, '')
        const val = parseFloat(value.replace(/["']/g, ''))
        return parseFloat(row[colName] ?? 0) <= val
      }
      if (condition.includes('>') && !condition.includes('>=')) {
        const [col, value] = condition.split('>').map(s => s.trim())
        const colName = col.replace(/["']/g, '')
        const val = parseFloat(value.replace(/["']/g, ''))
        return parseFloat(row[colName] ?? 0) > val
      }
      if (condition.includes('<') && !condition.includes('<=')) {
        const [col, value] = condition.split('<').map(s => s.trim())
        const colName = col.replace(/["']/g, '')
        const val = parseFloat(value.replace(/["']/g, ''))
        return parseFloat(row[colName] ?? 0) < val
      }
      if (condition.toUpperCase().includes('LIKE')) {
        const [col, pattern] = condition.split(/LIKE/i).map(s => s.trim())
        const colName = col.replace(/["']/g, '')
        const regexPattern = pattern.replace(/["']/g, '').replace(/%/g, '.*').replace(/_/g, '.')
        const regex = new RegExp(`^${regexPattern}$`, 'i')
        return regex.test(String(row[colName] ?? ''))
      }
      if (condition.toUpperCase().includes('IN')) {
        const [col, values] = condition.split(/IN/i).map(s => s.trim())
        const colName = col.replace(/["']/g, '')
        const valueList = values.replace(/[()]/g, '').split(',').map(v => v.trim().replace(/["']/g, ''))
        return valueList.includes(String(row[colName] ?? ''))
  }
      return true
    })
  })
}

function applyGroupBy(
  data: Record<string, any>[],
  selectClause: string,
  groupByColumns: string[],
  schemaColumns: Array<{ name: string; type: string }>
): Record<string, any>[] {
  // Group data by specified columns
  const groups = new Map<string, Record<string, any>[]>()

  for (const row of data) {
    const key = groupByColumns.map(col => String(row[col] ?? '')).join('|')
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(row)
  }

  // Apply aggregations from SELECT clause
  const result: Record<string, any>[] = []
  for (const [key, groupRows] of groups.entries()) {
    const groupValues = key.split('|')
    const aggregated: Record<string, any> = {}

    // Add group by columns
    groupByColumns.forEach((col, idx) => {
      aggregated[col] = groupValues[idx]
    })

    // Apply aggregations
    if (selectClause.toUpperCase().includes('COUNT')) {
      aggregated['count'] = groupRows.length
    }
    if (selectClause.toUpperCase().includes('SUM')) {
      const sumMatch = selectClause.match(/SUM\s*\(\s*["']?(\w+)["']?\s*\)/i)
      if (sumMatch) {
        const col = sumMatch[1]
        aggregated[`sum_${col}`] = groupRows.reduce((sum, r) => sum + (parseFloat(r[col] ?? 0) || 0), 0)
      }
    }
    if (selectClause.toUpperCase().includes('AVG')) {
      const avgMatch = selectClause.match(/AVG\s*\(\s*["']?(\w+)["']?\s*\)/i)
      if (avgMatch) {
        const col = avgMatch[1]
        const sum = groupRows.reduce((sum, r) => sum + (parseFloat(r[col] ?? 0) || 0), 0)
        aggregated[`avg_${col}`] = groupRows.length > 0 ? sum / groupRows.length : 0
      }
    }
    if (selectClause.toUpperCase().includes('MAX')) {
      const maxMatch = selectClause.match(/MAX\s*\(\s*["']?(\w+)["']?\s*\)/i)
      if (maxMatch) {
        const col = maxMatch[1]
        aggregated[`max_${col}`] = Math.max(...groupRows.map(r => parseFloat(r[col] ?? 0) || 0))
      }
    }
    if (selectClause.toUpperCase().includes('MIN')) {
      const minMatch = selectClause.match(/MIN\s*\(\s*["']?(\w+)["']?\s*\)/i)
      if (minMatch) {
        const col = minMatch[1]
        aggregated[`min_${col}`] = Math.min(...groupRows.map(r => parseFloat(r[col] ?? 0) || 0))
      }
    }

    result.push(aggregated)
  }

  return result
}

function applyOrderBy(data: Record<string, any>[], orderClause: string, schemaColumns: Array<{ name: string; type: string }>): Record<string, any>[] {
  // Parse ORDER BY clause
  const isDesc = orderClause.toUpperCase().includes('DESC')
  const isAsc = orderClause.toUpperCase().includes('ASC')
  
  // Extract column name (handle CAST expressions)
  let columnName = orderClause.replace(/CAST\s*\(/i, '').replace(/AS\s+DOUBLE\s+PRECISION/gi, '').replace(/["'()]/g, '').trim()
  columnName = columnName.split(/\s+/)[0] // Get first word (column name)

  // Find matching column (case-insensitive)
  const col = schemaColumns.find(c => c.name.toLowerCase() === columnName.toLowerCase())
  if (!col) {
    return data // Can't sort by unknown column
  }

  const sorted = [...data].sort((a, b) => {
    const valA = a[col.name]
    const valB = b[col.name]

    // Handle numeric sorting
    if (col.type === 'integer' || col.type === 'decimal' || col.type === 'number') {
      const numA = parseFloat(valA ?? 0) || 0
      const numB = parseFloat(valB ?? 0) || 0
      return isDesc ? numB - numA : numA - numB
    }

    // Handle string sorting
    const strA = String(valA ?? '').toLowerCase()
    const strB = String(valB ?? '').toLowerCase()
    if (isDesc) {
      return strB.localeCompare(strA)
    }
    return strA.localeCompare(strB)
  })

  return sorted
}
