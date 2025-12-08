/**
 * Build LLM prompt for per-chat file-based queries
 * Files are attached to the chat and persist across multiple queries
 */

import { getFilesByIds, type FileMetadata } from '@/lib/data/fileRegistry'

/**
 * Build example queries based on actual schema
 */
function buildExampleQueries(file: FileMetadata | undefined): string {
  if (!file || !file.columns || file.columns.length === 0) {
    return 'Examples will be generated based on your schema.'
  }

  const tableName = file.tableName || 'table'
  const columns = file.columns
  const colNames = columns.map(c => c.name)
  
  // Find common column types
  const textCols = columns.filter(c => c.type === 'text' || c.type === 'string').map(c => c.name)
  const numCols = columns.filter(c => c.type === 'integer' || c.type === 'decimal' || c.type === 'number').map(c => c.name)
  const dateCols = columns.filter(c => c.type === 'date' || c.type === 'timestamp' || /date|time/i.test(c.name)).map(c => c.name)
  
  const firstTextCol = textCols[0] || colNames[0]
  const secondTextCol = textCols[1] || colNames[1]
  const firstNumCol = numCols[0] || (colNames.find(c => c !== firstTextCol) || colNames[0])
  const dateCol = dateCols[0]

  const examples: string[] = []
  
  // Basic queries
  examples.push(`BASIC SELECTION:`)
  examples.push(`- "Show all ${firstTextCol}" → SELECT * FROM ${tableName}`)
  examples.push(`- "List all records" → SELECT * FROM ${tableName}`)
  examples.push(`- "Show me everything" → SELECT * FROM ${tableName}`)
  
  // Filtering queries
  if (firstTextCol) {
    examples.push(`\nFILTERING:`)
    examples.push(`- "Show ${firstTextCol} where ${secondTextCol || firstTextCol} is X" → SELECT * FROM ${tableName} WHERE "${secondTextCol || firstTextCol}" = 'X'`)
    examples.push(`- "Find ${firstTextCol} containing X" → SELECT * FROM ${tableName} WHERE "${firstTextCol}" LIKE '%X%'`)
    examples.push(`- "List ${firstTextCol} in (A, B, C)" → SELECT * FROM ${tableName} WHERE "${firstTextCol}" IN ('A', 'B', 'C')`)
  }
  
  // Numeric queries
  if (firstNumCol) {
    examples.push(`\nNUMERIC QUERIES:`)
    examples.push(`- "Show ${firstTextCol} where ${firstNumCol} > 100" → SELECT * FROM ${tableName} WHERE "${firstNumCol}" > 100`)
    examples.push(`- "Find ${firstTextCol} with ${firstNumCol} between 50 and 100" → SELECT * FROM ${tableName} WHERE "${firstNumCol}" BETWEEN 50 AND 100`)
    examples.push(`- "Top 10 ${firstTextCol} by ${firstNumCol}" → SELECT * FROM ${tableName} ORDER BY "${firstNumCol}" DESC LIMIT 10`)
  }
  
  // Aggregation queries
  if (firstTextCol && firstNumCol) {
    examples.push(`\nAGGREGATION:`)
    examples.push(`- "Count ${firstTextCol}" → SELECT COUNT(*) AS count FROM ${tableName}`)
    examples.push(`- "How many ${firstTextCol}?" → SELECT COUNT(*) AS count FROM ${tableName}`)
    examples.push(`- "Total ${firstNumCol}" → SELECT SUM("${firstNumCol}") AS total FROM ${tableName}`)
    examples.push(`- "Average ${firstNumCol}" → SELECT AVG("${firstNumCol}") AS avg_value FROM ${tableName}`)
    examples.push(`- "Maximum ${firstNumCol}" → SELECT MAX("${firstNumCol}") AS max_value FROM ${tableName}`)
    examples.push(`- "Minimum ${firstNumCol}" → SELECT MIN("${firstNumCol}") AS min_value FROM ${tableName}`)
  }
  
  // Grouping queries
  if (firstTextCol && secondTextCol && firstNumCol) {
    examples.push(`\nGROUPING:`)
    examples.push(`- "Count ${firstTextCol} per ${secondTextCol}" → SELECT "${secondTextCol}", COUNT(*) AS count FROM ${tableName} GROUP BY "${secondTextCol}"`)
    examples.push(`- "Total ${firstNumCol} by ${secondTextCol}" → SELECT "${secondTextCol}", SUM("${firstNumCol}") AS total FROM ${tableName} GROUP BY "${secondTextCol}"`)
    examples.push(`- "Average ${firstNumCol} for each ${secondTextCol}" → SELECT "${secondTextCol}", AVG("${firstNumCol}") AS avg_value FROM ${tableName} GROUP BY "${secondTextCol}"`)
  }
  
  // Date queries
  if (dateCol) {
    examples.push(`\nDATE/TIME QUERIES:`)
    examples.push(`- "Show ${firstTextCol} from last 30 days" → SELECT * FROM ${tableName} WHERE "${dateCol}" >= CURRENT_DATE - INTERVAL '30 days'`)
    examples.push(`- "Recent ${firstTextCol}" → SELECT * FROM ${tableName} ORDER BY "${dateCol}" DESC LIMIT 10`)
  }
  
  // Complex queries
  if (firstTextCol && firstNumCol && secondTextCol) {
    examples.push(`\nCOMPLEX QUERIES:`)
    examples.push(`- "Top 5 ${secondTextCol} by total ${firstNumCol}" → SELECT "${secondTextCol}", SUM("${firstNumCol}") AS total FROM ${tableName} GROUP BY "${secondTextCol}" ORDER BY total DESC LIMIT 5`)
    examples.push(`- "Show ${firstTextCol} where ${secondTextCol} is X and ${firstNumCol} > Y" → SELECT * FROM ${tableName} WHERE "${secondTextCol}" = 'X' AND "${firstNumCol}" > Y`)
  }

  return examples.join('\n')
}

export function buildPromptFromFiles(
  userQuery: string,
  fileIds: string[],
  timeRange?: string
): string {
  const files = getFilesByIds(fileIds)
  
  if (files.length === 0) {
    return `You are an AI SQL Analyst. The user has not attached any files to this chat yet. Please respond with:
{
  "reasoning": "No files are attached to this chat. Please attach CSV or Excel files to query data.",
  "sql": "not_available"
}`
  }

  // Check for coordinate columns
  const hasCoordinateColumns = files.some(file => 
    file.columns.some(col => ['LonD', 'LonM', 'LonS', 'EW', 'LatD', 'LatM', 'LatS', 'NS'].includes(col.name))
  )

  // Build concise schema description (limit to reduce tokens)
  const schemaDescription = files.map(file => {
    if (!file || !file.columns || !Array.isArray(file.columns)) {
      return `${file?.tableName || 'unknown'}: [invalid file data]`
    }
    
    const columnList = file.columns.map(col => {
      if (!col || !col.name) return ''
      // Only show sample for first 2 columns to save tokens
      const sampleValues = (file.data && Array.isArray(file.data) && file.columns.indexOf(col) < 2)
        ? file.data.slice(0, 2).map(row => row?.[col.name]).filter(v => v !== null && v !== undefined)
        : []
      const sampleHint = sampleValues.length > 0 
        ? ` (e.g. ${String(sampleValues[0]).substring(0, 20)})`
        : ''
      return `${col.name}(${col.type || 'text'})${sampleHint}`
    }).filter(Boolean).join(', ')
    
    const rowCount = (file.data && Array.isArray(file.data)) ? file.data.length : 0
    return `${file.tableName || 'table'}: ${columnList || 'no columns'} [${rowCount} rows]`
  }).filter(Boolean).join('\n')

  const coordinateInstructions = hasCoordinateColumns 
    ? [
        '',
        '====================================================',
        'COORDINATE HANDLING (CRITICAL):',
        '====================================================',
        '',
        'If the schema contains LonD, LonM, LonS, EW, LatD, LatM, LatS, NS columns:',
        '',
        'Longitude calculation:',
        '  Longitude = CASE WHEN "EW" = \'W\' THEN -1 ELSE 1 END * ("LonD" + "LonM"/60.0 + "LonS"/3600.0)',
        '',
        'Latitude calculation:',
        '  Latitude = CASE WHEN "NS" = \'S\' THEN -1 ELSE 1 END * ("LatD" + "LatM"/60.0 + "LatS"/3600.0)',
        '',
        'Examples:',
        '',
        'DIRECTIONAL QUERIES (west/east/north/south of):',
        '- "west of 100°W" or "located west of 100 degrees W"',
        '  -> WHERE (CASE WHEN "EW" = \'W\' THEN -1 ELSE 1 END * ("LonD" + "LonM"/60.0 + "LonS"/3600.0)) < -100',
        '  (West of 100°W means longitude < -100, i.e., more negative)',
        '',
        '- "east of 80°E" or "located east of 80 degrees E"',
        '  -> WHERE (CASE WHEN "EW" = \'W\' THEN -1 ELSE 1 END * ("LonD" + "LonM"/60.0 + "LonS"/3600.0)) > 80',
        '  (East of 80°E means longitude > 80, i.e., more positive)',
        '',
        '- "north of 40°N" or "located north of 40 degrees N"',
        '  -> WHERE (CASE WHEN "NS" = \'S\' THEN -1 ELSE 1 END * ("LatD" + "LatM"/60.0 + "LatS"/3600.0)) > 40',
        '  (North of 40°N means latitude > 40, i.e., more positive)',
        '',
        '- "south of 30°S" or "located south of 30 degrees S"',
        '  -> WHERE (CASE WHEN "NS" = \'S\' THEN -1 ELSE 1 END * ("LatD" + "LatM"/60.0 + "LatS"/3600.0)) < -30',
        '  (South of 30°S means latitude < -30, i.e., more negative)',
        '',
        'COMPARISON QUERIES (greater than/less than):',
        '- "longitude greater than 100°W" or "longitude > 100 W"',
        '  -> WHERE (CASE WHEN "EW" = \'W\' THEN -1 ELSE 1 END * ("LonD" + "LonM"/60.0 + "LonS"/3600.0)) > -100',
        '  (Greater than -100 means less west, so > -100)',
        '',
        '- "longitude less than 80°E" or "longitude < 80 E"',
        '  -> WHERE (CASE WHEN "EW" = \'W\' THEN -1 ELSE 1 END * ("LonD" + "LonM"/60.0 + "LonS"/3600.0)) < 80',
        '',
        '- "latitude greater than 40°N" or "latitude > 40 N"',
        '  -> WHERE (CASE WHEN "NS" = \'S\' THEN -1 ELSE 1 END * ("LatD" + "LatM"/60.0 + "LatS"/3600.0)) > 40',
        '',
        'CRITICAL RULES:',
        '- "west of X°W" means longitude < -X (more negative, further west)',
        '- "east of X°E" means longitude > X (more positive, further east)',
        '- "north of X°N" means latitude > X (more positive, further north)',
        '- "south of X°S" means latitude < -X (more negative, further south)',
        '- "100 degrees W" = -100 in decimal (west is negative)',
        '- "100 degrees E" = +100 in decimal (east is positive)',
        '- "40 degrees N" = +40 in decimal (north is positive)',
        '- "40 degrees S" = -40 in decimal (south is negative)',
        '- Always use the CASE expression to convert degrees/minutes/seconds to decimal',
        '- Always use exact column names: "LonD", "LonM", "LonS", "EW", "LatD", "LatM", "LatS", "NS"',
        ''
      ].join('\n')
    : ''

  // Build comprehensive examples based on actual schema
  const exampleQueries = buildExampleQueries(files[0])
  
  return `You are an advanced AI SQL Analyst. Your job is to understand ANY natural language question and convert it to accurate SQL.

SCHEMA (ONLY SOURCE OF TRUTH):
${schemaDescription}${coordinateInstructions}

====================================================
CORE PRINCIPLES
====================================================

1. INTELLIGENT UNDERSTANDING: Understand the user's intent, not just keywords
   - "show me" = SELECT
   - "how many" = COUNT
   - "what is the average" = AVG
   - "list all" = SELECT * (with appropriate filters)
   - "find" = SELECT with WHERE
   - "compare" = SELECT with multiple conditions or GROUP BY
   - "top 10" = SELECT with ORDER BY and LIMIT
   - "between X and Y" = WHERE column BETWEEN X AND Y
   - "greater than/less than" = WHERE column >/< value
   - "contains/includes" = WHERE column LIKE '%value%' or IN clause
   - "not" = WHERE column != value or NOT IN

2. SMART COLUMN MATCHING:
   - Exact match first: "City" → "City"
   - Case-insensitive: "city" → "City" or "CITY"
   - Fuzzy match: "cites" → "City", "produts" → "Products"
   - Partial match: "state" → "State", "state_code" → "State"
   - Semantic match: "location" → "City" or "State", "amount" → "Price" or "Total"
   - Plural/singular: "cities" → "City", "products" → "Product"
   - Abbreviations: "TX" → "Texas", "CA" → "California"

3. COMPLETE SQL GENERATION:
   - Always generate complete, executable SQL
   - Include all necessary clauses (SELECT, FROM, WHERE, GROUP BY, ORDER BY, LIMIT)
   - Use proper SQL syntax (quotes for strings, no quotes for numbers)
   - Handle NULL values appropriately
   - Use proper operators: =, !=, <, >, <=, >=, LIKE, IN, BETWEEN, IS NULL, IS NOT NULL

4. AGGREGATION INTELLIGENCE:
   - "count" → COUNT(*)
   - "how many" → COUNT(*)
   - "total" → SUM(column)
   - "average" or "avg" → AVG(column)
   - "mean" → AVG(column)
   - "maximum" or "max" → MAX(column)
   - "minimum" or "min" → MIN(column)
   - "per" or "by" → GROUP BY
   - "each" → GROUP BY

5. FILTERING INTELLIGENCE:
   - "in" or list of values → WHERE column IN ('val1', 'val2')
   - "not in" → WHERE column NOT IN ('val1', 'val2')
   - "greater than" → WHERE column > value
   - "less than" → WHERE column < value
   - "at least" → WHERE column >= value
   - "at most" → WHERE column <= value
   - "equals" or "is" → WHERE column = value
   - "not equal" or "is not" → WHERE column != value
   - "contains" → WHERE column LIKE '%value%'
   - "starts with" → WHERE column LIKE 'value%'
   - "ends with" → WHERE column LIKE '%value'
   - "between X and Y" → WHERE column BETWEEN X AND Y

6. SORTING INTELLIGENCE:
   - "top N" → ORDER BY column DESC LIMIT N
   - "bottom N" → ORDER BY column ASC LIMIT N
   - "highest" → ORDER BY column DESC
   - "lowest" → ORDER BY column ASC
   - "alphabetically" → ORDER BY column ASC
   - "reverse" → ORDER BY column DESC

7. COMPLEX QUERIES:
   - Multiple conditions: Use AND/OR appropriately
   - "and" → AND
   - "or" → OR
   - "but not" → AND column != value
   - "except" → AND column NOT IN (...)
   - Nested logic: Use parentheses for complex conditions

====================================================
QUERY TYPE EXAMPLES
====================================================

${exampleQueries}

====================================================
COMMON PATTERNS
====================================================

COUNT QUERIES:
- "How many X?" → SELECT COUNT(*) AS count FROM table
- "Count X" → SELECT COUNT(*) AS count FROM table
- "Number of X" → SELECT COUNT(*) AS count FROM table
- "How many X in Y?" → SELECT COUNT(*) AS count FROM table WHERE Y = value

AGGREGATION QUERIES:
- "What is the average X?" → SELECT AVG("X") AS avg_x FROM table
- "Total X" → SELECT SUM("X") AS total_x FROM table
- "Maximum X" → SELECT MAX("X") AS max_x FROM table
- "Minimum X" → SELECT MIN("X") AS min_x FROM table

GROUPING QUERIES:
- "X per Y" → SELECT "Y", COUNT(*) AS count FROM table GROUP BY "Y"
- "X by Y" → SELECT "Y", COUNT(*) AS count FROM table GROUP BY "Y"
- "X for each Y" → SELECT "Y", COUNT(*) AS count FROM table GROUP BY "Y"
- "Breakdown of X by Y" → SELECT "Y", COUNT(*) AS count FROM table GROUP BY "Y"

FILTERING QUERIES:
- "Show X where Y is Z" → SELECT * FROM table WHERE "Y" = 'Z'
- "List X in Y" → SELECT * FROM table WHERE "Y" = value
- "Find X with Y greater than Z" → SELECT * FROM table WHERE "Y" > Z
- "X that contain Y" → SELECT * FROM table WHERE "X" LIKE '%Y%'

COMPARISON QUERIES:
- "Compare X and Y" → SELECT "X", "Y" FROM table
- "X vs Y" → SELECT "X", "Y" FROM table
- "Difference between X and Y" → SELECT "X", "Y", ("X" - "Y") AS difference FROM table

TOP/BOTTOM QUERIES:
- "Top 10 X" → SELECT * FROM table ORDER BY "X" DESC LIMIT 10
- "Bottom 5 X" → SELECT * FROM table ORDER BY "X" ASC LIMIT 5
- "Highest X" → SELECT * FROM table ORDER BY "X" DESC LIMIT 1
- "Lowest X" → SELECT * FROM table ORDER BY "X" ASC LIMIT 1

====================================================
CRITICAL RULES
====================================================

1. SCHEMA COMPLIANCE:
   - Use ONLY tables/columns from the schema above
   - NEVER invent tables or columns
   - Match column names exactly (case-sensitive if quoted)
   - Use double quotes for case-sensitive identifiers: "ColumnName"

2. TYPO HANDLING:
   - Auto-correct obvious typos: "cites"→"City", "produts"→"Products"
   - Use fuzzy matching for similar names
   - Explain corrections in reasoning

3. SQL VALIDITY:
   - Generate complete, valid SQL
   - No incomplete WHERE clauses
   - Proper quoting: strings in single quotes, numbers without quotes
   - Use proper SQL operators

4. QUESTION ANSWERING:
   - SQL must EXACTLY answer the question
   - Include all relevant columns
   - Apply correct filters
   - Use appropriate aggregations

5. EDGE CASES:
   - Handle NULL values: WHERE column IS NULL or IS NOT NULL
   - Handle empty strings: WHERE column != '' AND column IS NOT NULL
   - Handle case sensitivity: Use LOWER() or UPPER() if needed
   - Handle date/time: Use proper date functions if available

====================================================
OUTPUT FORMAT (STRICT JSON)
====================================================

{
  "sql": "<COMPLETE, VALID SQL query using exact table/column names from schema>",
  "reasoning": "<Brief explanation: how you understood the question, which columns you mapped, and why>"
}

REASONING SHOULD INCLUDE:
- What the user is asking for
- Which columns/tables you selected and why
- Any typos you corrected
- Any assumptions you made
- How the SQL answers the question

====================================================
SELF-VALIDATION CHECKLIST
====================================================

Before responding, verify:
✓ SQL uses ONLY tables/columns from schema (no invented names)
✓ All column names match schema exactly (case-sensitive if quoted)
✓ SQL is complete and executable (no incomplete clauses)
✓ SQL directly answers the user's question
✓ Proper use of quotes (single for strings, double for identifiers)
✓ Aggregations are correct (COUNT, SUM, AVG, MAX, MIN)
✓ Filters match user intent
✓ GROUP BY includes all non-aggregated columns
✓ ORDER BY and LIMIT used correctly for "top/bottom" queries
✓ Reasoning explains your thought process

====================================================
USER QUERY
====================================================

"${userQuery}"
${timeRange && timeRange !== 'all_time' ? `\nTime range filter: ${timeRange.replace(/_/g, ' ')}` : ''}

Generate the SQL query that best answers this question.`
}
