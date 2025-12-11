/**
 * Build LLM prompt for per-chat file-based queries
 * 
 * Files are attached to the chat and persist across multiple queries. This generates a detailed
 * prompt that includes the schema from uploaded files, example queries, and strict rules for
 * SQL generation. If files aren't found on disk (serverless reset), it recovers them from chatStore.
 */

import { getFilesByIds, type FileMetadata } from '@/lib/data/fileRegistry'
import { getChat, getChatFiles } from '@/lib/data/chatStore'

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
    examples.push(`- "Top 10 ${firstTextCol} by ${firstNumCol}" → SELECT * FROM ${tableName} ORDER BY CAST("${firstNumCol}" AS DOUBLE PRECISION) DESC LIMIT 10`)
    examples.push(`- "Top ${firstTextCol} by ${firstNumCol}" → SELECT * FROM ${tableName} ORDER BY CAST("${firstNumCol}" AS DOUBLE PRECISION) DESC LIMIT 10`)
    examples.push(`- "Highest ${firstNumCol}" → SELECT * FROM ${tableName} ORDER BY CAST("${firstNumCol}" AS DOUBLE PRECISION) DESC LIMIT 10`)
    examples.push(`- "Lowest ${firstNumCol}" → SELECT * FROM ${tableName} ORDER BY CAST("${firstNumCol}" AS DOUBLE PRECISION) ASC LIMIT 10`)
    examples.push(`- "5 cheapest ${firstTextCol}" → SELECT * FROM ${tableName} ORDER BY CAST("${firstNumCol}" AS DOUBLE PRECISION) ASC LIMIT 5`)
    examples.push(`- "Bottom 20 ${firstTextCol} by ${firstNumCol}" → SELECT * FROM ${tableName} ORDER BY CAST("${firstNumCol}" AS DOUBLE PRECISION) ASC LIMIT 20`)
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
    examples.push(`- "Average ${firstNumCol} per ${secondTextCol} where count > 10" → SELECT "${secondTextCol}", AVG("${firstNumCol}") AS avg_value, COUNT(*) AS count FROM ${tableName} GROUP BY "${secondTextCol}" HAVING COUNT(*) > 10`)
  }
  
  // Subquery examples
  if (firstTextCol && secondTextCol && firstNumCol) {
    examples.push(`\nSUBQUERIES:`)
    examples.push(`- "${firstTextCol} where ${firstNumCol} > average ${firstNumCol} for ${secondTextCol}" → SELECT * FROM ${tableName} WHERE "${firstNumCol}" > (SELECT AVG("${firstNumCol}") FROM ${tableName} AS t2 WHERE t2."${secondTextCol}" = ${tableName}."${secondTextCol}")`)
    examples.push(`- "Top 5 ${firstTextCol} in each ${secondTextCol} by ${firstNumCol}" → SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY "${secondTextCol}" ORDER BY "${firstNumCol}" DESC) AS rn FROM ${tableName}) WHERE rn <= 5`)
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
    examples.push(`- "Top 5 ${secondTextCol} by total ${firstNumCol}" → SELECT "${secondTextCol}", SUM("${firstNumCol}") AS total FROM ${tableName} GROUP BY "${secondTextCol}" ORDER BY CAST(total AS DOUBLE PRECISION) DESC LIMIT 5`)
    examples.push(`- "Show ${firstTextCol} where ${secondTextCol} is X and ${firstNumCol} > Y" → SELECT * FROM ${tableName} WHERE "${secondTextCol}" = 'X' AND "${firstNumCol}" > Y`)
    examples.push(`- "Top 10 most expensive ${firstTextCol} in ${secondTextCol}" → SELECT * FROM ${tableName} WHERE "${secondTextCol}" = 'X' ORDER BY CAST("${firstNumCol}" AS DOUBLE PRECISION) DESC LIMIT 10`)
  }

  return examples.join('\n')
}

export function buildPromptFromFiles(
  userQuery: string,
  fileIds: string[],
  timeRange?: string,
  chatId?: string
): string {
  let files = getFilesByIds(fileIds)
  
  // CRITICAL: If disk storage is empty but we have fileIds, try to recover from chatStore
  // This should rarely happen since files are now saved to disk, but it's a safety net
  if (files.length === 0 && fileIds.length > 0 && chatId) {
    try {
      const chat = getChat(chatId)
      if (chat) {
        const chatFiles = getChatFiles(chat.chatId)
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
        } else if (chatFiles.length > 0) {
          // Fallback: use all chat files if IDs don't match
          files = chatFiles
          
          // Re-save to disk
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
      // Failed to recover files from chatStore
    }
  }
  
  // CRITICAL: If still no files but chatId exists, try to get ANY files from chatStore
  if (files.length === 0 && chatId) {
    try {
      const chat = getChat(chatId)
      if (chat) {
        const chatFiles = getChatFiles(chat.chatId)
        if (chatFiles.length > 0) {
          files = chatFiles
          
          // Re-save to disk
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
  
  return `SYSTEM ROLE: YOU ARE A STRICT SQL GENERATOR FOR AN IN-MEMORY ANALYTICS ENGINE

You NEVER return random results. You ALWAYS generate deterministic, correct SQL that the backend can execute directly on an in-memory table.

You have ONE JOB:
Given:
- a table name
- a list of column names and types
- a natural language query

You must return a SINGLE, SAFE, VALID SQL SELECT statement plus a short reasoning string in JSON.

You MUST obey all rules below EXACTLY. Do not be "creative". Do not ignore any rule.

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

6. SORTING INTELLIGENCE (CRITICAL FOR TOP/BOTTOM QUERIES):
   - "top N" → ORDER BY CAST(column AS DOUBLE PRECISION) DESC LIMIT N
   - "bottom N" → ORDER BY CAST(column AS DOUBLE PRECISION) ASC LIMIT N
   - "highest" → ORDER BY CAST(column AS DOUBLE PRECISION) DESC LIMIT 10 (if no N specified)
   - "lowest" → ORDER BY CAST(column AS DOUBLE PRECISION) ASC LIMIT 10 (if no N specified)
   - "largest" → ORDER BY CAST(column AS DOUBLE PRECISION) DESC LIMIT 10 (if no N specified)
   - "smallest" → ORDER BY CAST(column AS DOUBLE PRECISION) ASC LIMIT 10 (if no N specified)
   - "alphabetically" → ORDER BY column ASC (text columns, no CAST needed)
   - "reverse" → ORDER BY column DESC (text columns, no CAST needed)
   
   CRITICAL: Always use CAST(...AS DOUBLE PRECISION) for numeric columns to ensure numeric sorting, not lexicographic sorting.

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

TOP/BOTTOM QUERIES (CRITICAL - FOLLOW EXACTLY):
====================================================
When the user asks queries related to "top", "highest", "lowest", "top N", "bottom N", "largest", or "smallest", you MUST follow these exact rules:

1. INTERPRET "TOP" CORRECTLY:
   - "Top items" = highest values, sorted DESC, then LIMIT N
   - "Bottom items" = lowest values, sorted ASC, then LIMIT N
   - "Highest" = ORDER BY column DESC
   - "Lowest" = ORDER BY column ASC
   - "Largest" = ORDER BY column DESC
   - "Smallest" = ORDER BY column ASC

   Examples:
   - "Top 10 items by price" → ORDER BY "Price" DESC LIMIT 10
   - "Top 5 most expensive" → ORDER BY "Price" DESC LIMIT 5
   - "Cheapest 20 products" → ORDER BY "Price" ASC LIMIT 20
   - "Highest priced items" → ORDER BY "Price" DESC LIMIT 10 (assume 10 if no number)
   - "Lowest cost items" → ORDER BY "Cost" ASC LIMIT 10 (assume 10 if no number)

2. ALWAYS SORT NUMERICALLY, NEVER LEXICOGRAPHICALLY:
   - Before generating SQL, ensure the column is numeric
   - If the column is numeric, sorting MUST be based on numeric value
   - If needed, cast safely: ORDER BY CAST("Price" AS DOUBLE PRECISION) DESC
   - NEVER sort numeric columns as strings (this causes "10" < "2" errors)

3. ALWAYS INCLUDE LIMIT N:
   - If the user says "top items" without giving a number → assume LIMIT 10
   - Examples:
     - "Show top items by price" → LIMIT 10
     - "Top products" → LIMIT 10
     - "Top 5 items" → LIMIT 5
     - "Top 20" → LIMIT 20

4. NEVER HALLUCINATE COLUMN NAMES:
   - Use ONLY column names provided in the schema
   - If the relevant column does not exist → return error in reasoning:
     "Cannot answer: Column 'Price' not found in the selected file. Available columns: [list]"
   - Do NOT attempt to guess or create new columns

5. NEVER GUESS THE SORT COLUMN:
   - If the user asks "top N items" but doesn't say by what → respond:
     "Missing sort column. The user must specify 'Top N items by <column>'."
   - Example: "Top 10" without "by X" → return error in reasoning

6. STRICT SQL OUTPUT FORMAT:
   You must ALWAYS return SQL in this exact format:
   {
     "sql": "SELECT * FROM <table> ORDER BY CAST(\"<column>\" AS DOUBLE PRECISION) <ASC|DESC> LIMIT <number>;",
     "reasoning": "Explain EXACTLY how you interpreted 'top' or 'bottom' and why sorting direction was chosen."
   }

7. EXAMPLES YOU MUST FOLLOW:
   Example A — User: "Show me the top 10 items by price"
   {
     "sql": "SELECT * FROM products ORDER BY CAST(\"Price\" AS DOUBLE PRECISION) DESC LIMIT 10;",
     "reasoning": "User wants top 10 items by price. 'Top' means highest values, so ORDER BY DESC. Using CAST to ensure numeric sorting. LIMIT 10 as specified."
   }

   Example B — User: "Show highest priced items"
   {
     "sql": "SELECT * FROM products ORDER BY CAST(\"Price\" AS DOUBLE PRECISION) DESC LIMIT 10;",
     "reasoning": "User wants highest priced items. 'Highest' means DESC order. No number specified, so assuming LIMIT 10. Using CAST for numeric sorting."
   }

   Example C — User: "Show me the 5 cheapest items"
   {
     "sql": "SELECT * FROM products ORDER BY CAST(\"Price\" AS DOUBLE PRECISION) ASC LIMIT 5;",
     "reasoning": "User wants 5 cheapest items. 'Cheapest' means lowest values, so ORDER BY ASC. LIMIT 5 as specified. Using CAST for numeric sorting."
   }

8. ERROR HANDLING:
   - If column doesn't exist: Return error in reasoning, sql = "not_available"
   - If sort column not specified: Return error in reasoning, sql = "not_available"
   - NEVER guess or invent columns

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
