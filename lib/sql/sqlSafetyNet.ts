/**
 * Backend safety net for TOP/BOTTOM queries
 * 
 * When the user asks for "top N", the LLM might guess wrong, so we validate and adjust the ORDER BY here.
 * This ensures numeric sorting even if the LLM doesn't generate CAST expressions.
 */

/**
 * Detect if a query is a top/bottom query based on user query text
 */
export function isTopOrBottomQuery(userQuery: string): boolean {
  if (!userQuery) return false
  
  const lowerQuery = userQuery.toLowerCase()
  const topBottomKeywords = [
    'top', 'highest', 'most expensive', 'largest', 'biggest',
    'lowest', 'smallest', 'cheapest', 'least expensive', 'bottom'
  ]
  
  return topBottomKeywords.some(keyword => lowerQuery.includes(keyword))
}

/**
 * Check if SQL includes Price (or other numeric columns) in ORDER BY but no CAST
 */
export function sqlIncludesNumericColumnButNoCast(sql: string, columns: Array<{ name: string; type: string }>): {
  needsFix: boolean
  columnName: string | null
} {
  if (!sql) return { needsFix: false, columnName: null }
  
  // Find ORDER BY clause
  const orderByMatch = sql.match(/ORDER\s+BY\s+([^;]+?)(?:\s+LIMIT|\s*;|\s*$)/i)
  if (!orderByMatch) {
    return { needsFix: false, columnName: null }
  }
  
  const orderByClause = orderByMatch[1].trim()
  
  // Check if CAST is already present
  if (orderByClause.includes('CAST') || orderByClause.includes('cast')) {
    return { needsFix: false, columnName: null }
  }
  
  // Find numeric columns that might need casting
  // Prefer: price, amount, total, revenue, cost, score, rating, quantity, stock
  const numericColumnNames = [
    'price', 'amount', 'total', 'revenue', 'cost', 'score', 'rating', 
    'quantity', 'stock', 'count', 'sum', 'avg', 'max', 'min'
  ]
  
  // Also check actual numeric columns from schema
  const numericColumns = columns.filter(col => {
    const type = col.type.toLowerCase()
    return type === 'integer' || type === 'decimal' || type === 'numeric' || 
           type === 'number' || type === 'float' || type === 'double'
  })
  
  // Check for numeric column names in ORDER BY (case-insensitive)
  for (const colName of numericColumnNames) {
    const regex = new RegExp(`["']?${colName}["']?`, 'i')
    if (regex.test(orderByClause)) {
      // Find the exact column name (with quotes if present)
      const exactMatch = orderByClause.match(new RegExp(`(["']?)${colName}\\1`, 'i'))
      if (exactMatch) {
        const quoted = exactMatch[1] ? `"${colName}"` : colName
        return { needsFix: true, columnName: quoted }
      }
    }
  }
  
  // Check actual numeric columns from schema
  for (const col of numericColumns) {
    const regex = new RegExp(`["']?${col.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?`, 'i')
    if (regex.test(orderByClause)) {
      // Find the exact column name (with quotes if present)
      const exactMatch = orderByClause.match(new RegExp(`(["']?)${col.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'i'))
      if (exactMatch) {
        const quoted = exactMatch[1] ? `"${col.name}"` : col.name
        return { needsFix: true, columnName: quoted }
      }
    }
  }
  
  return { needsFix: false, columnName: null }
}

/**
 * Fix SQL to add CAST for numeric columns in ORDER BY
 */
export function fixNumericSortingInSql(
  sql: string, 
  columns: Array<{ name: string; type: string }>
): string {
  if (!sql) return sql
  
  const check = sqlIncludesNumericColumnButNoCast(sql, columns)
  if (!check.needsFix || !check.columnName) {
    return sql
  }
  
  const columnName = check.columnName
  const columnNameEscaped = columnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  
  // Pattern to match ORDER BY with the column (with or without quotes, case-insensitive)
  // Match: ORDER BY "Price" DESC or ORDER BY Price DESC
  const orderByPattern = new RegExp(
    `(ORDER\\s+BY\\s+)(["']?)${columnNameEscaped}\\2(\\s+(ASC|DESC))?`,
    'i'
  )
  
  if (orderByPattern.test(sql)) {
    // Replace ORDER BY column with ORDER BY CAST(column AS DOUBLE PRECISION)
    const fixedSql = sql.replace(
      orderByPattern,
      (match, orderBy, quote, direction) => {
        const dir = direction ? direction.trim() : ''
        return `${orderBy}CAST(${columnName} AS DOUBLE PRECISION)${dir ? ' ' + dir : ''}`
      }
    )
    
    return fixedSql
  }
  
  return sql
}

/**
 * Main function to apply safety net fixes
 */
export function applySqlSafetyNet(
  sql: string,
  userQuery: string,
  columns: Array<{ name: string; type: string }>
): string {
  if (!sql || sql === 'not_available') {
    return sql
  }
  
  // Only apply fixes for top/bottom queries
  if (!isTopOrBottomQuery(userQuery)) {
    return sql
  }
  
  // Fix numeric sorting
  const fixedSql = fixNumericSortingInSql(sql, columns)
  
  return fixedSql
}
