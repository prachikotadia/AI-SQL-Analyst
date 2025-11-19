function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        )
      }
    }
  }

  return matrix[len1][len2]
}

function similarityScore(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1.0
  
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase())
  return 1 - (distance / maxLen)
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove special chars, spaces, underscores
    .trim()
}

function isPluralSingular(str1: string, str2: string): boolean {
  const norm1 = normalize(str1)
  const norm2 = normalize(str2)
  
  // Common plural patterns
  const pluralPatterns = [
    { singular: /y$/, plural: /ies$/ }, // city -> cities
    { singular: /s$/, plural: /es$/ },   // class -> classes
    { singular: /f$/, plural: /ves$/ },   // leaf -> leaves
  ]
  
  // Check if one is plural of the other
  if (norm1 === norm2 + 's' || norm2 === norm1 + 's') return true
  if (norm1 === norm2 + 'es' || norm2 === norm1 + 'es') return true
  
  // Check special patterns
  for (const pattern of pluralPatterns) {
    if (norm1.match(pattern.plural) && norm2.match(pattern.singular)) {
      const base1 = norm1.replace(pattern.plural, '')
      const base2 = norm2.replace(pattern.singular, '')
      if (base1 === base2) return true
    }
    if (norm1.match(pattern.singular) && norm2.match(pattern.plural)) {
      const base1 = norm1.replace(pattern.singular, '')
      const base2 = norm2.replace(pattern.plural, '')
      if (base1 === base2) return true
    }
  }
  
  return false
}

function containsMatch(str1: string, str2: string): boolean {
  const norm1 = normalize(str1)
  const norm2 = normalize(str2)
  return norm1.includes(norm2) || norm2.includes(norm1)
}

const semanticMap: Record<string, string[]> = {
  'city': ['town', 'cities', 'towns', 'urban', 'municipality'],
  'name': ['title', 'label', 'identifier'],
  'amount': ['total', 'sum', 'value', 'price', 'cost', 'revenue'],
  'date': ['time', 'timestamp', 'created', 'updated', 'when'],
  'count': ['number', 'quantity', 'num'],
  'id': ['identifier', 'key', 'pk'],
}

function getSemanticMatches(str: string): string[] {
  const normalized = normalize(str)
  const matches: string[] = []
  
  for (const [key, synonyms] of Object.entries(semanticMap)) {
    if (normalized === normalize(key) || synonyms.some(s => normalize(s) === normalized)) {
      matches.push(key, ...synonyms)
    }
  }
  
  return matches
}

export interface FuzzyMatchResult {
  matched: string | null
  score: number
  reason: string
}

export function fuzzyMatchName(
  userInput: string,
  availableNames: string[],
  context?: string
): FuzzyMatchResult {
  if (!userInput || availableNames.length === 0) {
    return {
      matched: null,
      score: 0,
      reason: 'No input or no available names',
    }
  }

  const normalizedInput = normalize(userInput)
  const inputLower = userInput.toLowerCase()
  
  // 1. Exact match (case-insensitive)
  const exactMatch = availableNames.find(name => 
    normalize(name) === normalizedInput || name.toLowerCase() === inputLower
  )
  if (exactMatch) {
    return {
      matched: exactMatch,
      score: 1.0,
      reason: 'Exact match',
    }
  }

  // 2. Plural/singular match
  const pluralMatch = availableNames.find(name => 
    isPluralSingular(userInput, name)
  )
  if (pluralMatch) {
    return {
      matched: pluralMatch,
      score: 0.95,
      reason: `Plural/singular variant: "${userInput}" → "${pluralMatch}"`,
    }
  }

  // 3. Contains match (partial)
  const containsMatchResult = availableNames.find(name => 
    containsMatch(userInput, name) && similarityScore(userInput, name) > 0.5
  )
  if (containsMatchResult) {
    return {
      matched: containsMatchResult,
      score: 0.85,
      reason: `Partial match: "${userInput}" → "${containsMatchResult}"`,
    }
  }

  // 4. Semantic similarity
  const semanticMatches = getSemanticMatches(userInput)
  const semanticResult = availableNames.find(name => 
    semanticMatches.some(match => normalize(match) === normalize(name))
  )
  if (semanticResult) {
    return {
      matched: semanticResult,
      score: 0.8,
      reason: `Semantic match: "${userInput}" → "${semanticResult}"`,
    }
  }

  // 5. Fuzzy match using Levenshtein distance
  let bestMatch: string | null = null
  let bestScore = 0
  const threshold = 0.6 // Minimum similarity threshold

  for (const name of availableNames) {
    const score = similarityScore(userInput, name)
    
    // Boost score if context matches
    if (context) {
      const contextLower = context.toLowerCase()
      const nameLower = name.toLowerCase()
      if (contextLower.includes(nameLower) || nameLower.includes(contextLower)) {
        // Boost by 0.1 if context matches
        const boostedScore = Math.min(1.0, score + 0.1)
        if (boostedScore > bestScore) {
          bestScore = boostedScore
          bestMatch = name
        }
        continue
      }
    }
    
    if (score > bestScore) {
      bestScore = score
      bestMatch = name
    }
  }

  if (bestMatch && bestScore >= threshold) {
    return {
      matched: bestMatch,
      score: bestScore,
      reason: `Fuzzy match (${Math.round(bestScore * 100)}% similarity): "${userInput}" → "${bestMatch}"`,
    }
  }

  // No match found
  return {
    matched: null,
    score: 0,
    reason: `No match found for "${userInput}". Available: ${availableNames.slice(0, 5).join(', ')}${availableNames.length > 5 ? '...' : ''}`,
  }
}

export function fuzzyMatchSQL(
  sql: string,
  availableTables: string[],
  availableColumns: Record<string, string[]>
): { sql: string; mappings: string[] } {
  let correctedSQL = sql
  const mappings: string[] = []

  // Extract table names from FROM and JOIN (handle quoted and unquoted)
  const tablePattern = /(?:FROM|JOIN)\s+("?)(\w+)\1/gi
  let match
  const processedTables = new Set<string>()
  while ((match = tablePattern.exec(sql)) !== null) {
    const quote = match[1]
    const userTable = match[2]
    const fullMatch = match[0]
    
    if (processedTables.has(fullMatch)) continue
    processedTables.add(fullMatch)
    
    const fuzzyResult = fuzzyMatchName(userTable, availableTables, sql)
    
    if (fuzzyResult.matched && fuzzyResult.matched !== userTable) {
      const replacement = quote ? `"${fuzzyResult.matched}"` : fuzzyResult.matched
      correctedSQL = correctedSQL.replace(fullMatch, fullMatch.replace(userTable, fuzzyResult.matched))
      mappings.push(`Table: "${userTable}" → "${fuzzyResult.matched}" (${fuzzyResult.reason})`)
    }
  }

  // Extract column names - handle both quoted "ColumnName" and unquoted column_name
  // Also handle table.column and standalone columns
  const columnPatterns = [
    /"([^"]+)"/g,  // Quoted identifiers: "LonD", "State"
    /\b(\w+)\.(\w+)\b/gi,  // Table.column
    /\bSELECT\s+([^,\s]+(?:,\s*[^,\s]+)*)\s+FROM/gi,  // SELECT columns
  ]
  
  // Process quoted column names first (most important for case-sensitive columns)
  const quotedPattern = /"([^"]+)"/g
  let quotedMatch
  while ((quotedMatch = quotedPattern.exec(correctedSQL)) !== null) {
    const quotedName = quotedMatch[1]
    const fullQuoted = `"${quotedName}"`
    
    // Skip if it's a table name we already processed
    if (availableTables.some(t => t.toLowerCase() === quotedName.toLowerCase())) {
      continue
    }
    
    // Check all tables for this column
    for (const [tableName, columns] of Object.entries(availableColumns)) {
      const fuzzyResult = fuzzyMatchName(quotedName, columns, correctedSQL)
      
      if (fuzzyResult.matched && fuzzyResult.matched !== quotedName) {
        // Replace quoted column name with correct one
        correctedSQL = correctedSQL.replace(fullQuoted, `"${fuzzyResult.matched}"`)
        mappings.push(`Column: "${quotedName}" → "${fuzzyResult.matched}" (${fuzzyResult.reason})`)
        break
      }
    }
  }
  
  // Process unquoted column references (table.column and standalone)
  const unquotedColumnPattern = /\b(\w+)\.(\w+)\b/gi
  let unquotedMatch
  while ((unquotedMatch = unquotedColumnPattern.exec(correctedSQL)) !== null) {
    const tableName = unquotedMatch[1]
    const columnName = unquotedMatch[2]
    const fullMatch = unquotedMatch[0]
    
    // Skip SQL keywords
    if (columnName.match(/^(SELECT|FROM|WHERE|GROUP|ORDER|BY|LIMIT|AS|AND|OR|NOT|CASE|WHEN|THEN|ELSE|END)$/i)) {
      continue
    }
    
    // Find table
    const tableMatch = fuzzyMatchName(tableName, availableTables)
    if (tableMatch.matched && availableColumns[tableMatch.matched]) {
      const columnsToCheck = availableColumns[tableMatch.matched]
      const fuzzyResult = fuzzyMatchName(columnName, columnsToCheck, correctedSQL)
      
      if (fuzzyResult.matched && fuzzyResult.matched !== columnName) {
        // Replace with quoted correct name if original table/column had capitals
        const needsQuotes = /[A-Z]/.test(fuzzyResult.matched)
        const replacement = needsQuotes 
          ? `${tableMatch.matched}."${fuzzyResult.matched}"`
          : `${tableMatch.matched}.${fuzzyResult.matched}`
        correctedSQL = correctedSQL.replace(fullMatch, replacement)
        mappings.push(`Column: "${columnName}" → "${fuzzyResult.matched}" (${fuzzyResult.reason})`)
      }
    }
  }

  return { sql: correctedSQL, mappings }
}

