/**
 * Attempt to repair malformed JSON from LLM responses
 * Handles truncated JSON by completing missing fields
 */
export function repairJson(jsonString: string): string | null {
  try {
    // Try parsing first
    JSON.parse(jsonString)
    return jsonString
  } catch {
    // Continue with repair attempts
  }

  let repaired = jsonString.trim()

  // Remove markdown code blocks
  repaired = repaired.replace(/```json\s*/g, '')
  repaired = repaired.replace(/```\s*/g, '')
  repaired = repaired.replace(/`/g, '')

  // Try to extract JSON object
  const jsonMatch = repaired.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    repaired = jsonMatch[0]
  }

  // Check if JSON is truncated (ends mid-string or mid-object)
  const openBraces = (repaired.match(/\{/g) || []).length
  const closeBraces = (repaired.match(/\}/g) || []).length
  const openBrackets = (repaired.match(/\[/g) || []).length
  const closeBrackets = (repaired.match(/\]/g) || []).length
  
  // If JSON appears truncated, try to complete it
  if (openBraces > closeBraces || openBrackets > closeBrackets) {
    // Check if we're in the middle of a string value
    // Find the last complete field (ends with ",)
    const lastCompleteField = repaired.lastIndexOf('",')
    const lastCompleteFieldWithComma = repaired.lastIndexOf('", ')
    
    if (lastCompleteField > 0 || lastCompleteFieldWithComma > 0) {
      // Extract up to the last complete field
      const cutPoint = Math.max(lastCompleteField, lastCompleteFieldWithComma) + 2
      let partial = repaired.substring(0, cutPoint)
      
      // Check what fields we have
      const hasPreviewSql = partial.includes('"preview_sql"')
      const hasActionSql = partial.includes('"action_sql"')
      const hasSql = partial.includes('"sql"')
      const hasReasoning = partial.includes('"reasoning"')
      const hasChart = partial.includes('"chart"')
      
      // If reasoning is incomplete, close it
      if (hasReasoning && !partial.match(/"reasoning"\s*:\s*"[^"]*",?\s*$/)) {
        // Find where reasoning starts
        const reasoningMatch = partial.match(/"reasoning"\s*:\s*"([^"]*)/)
        if (reasoningMatch) {
          // Extract the partial reasoning value
          const partialReasoning = reasoningMatch[1] || 'Generated SQL query'
          // Remove the incomplete reasoning and add complete one
          partial = partial.replace(/"reasoning"\s*:\s*"[^"]*$/, `"reasoning": "${partialReasoning}"`)
        }
      }
      
      // Add missing fields
      if (!hasReasoning) {
        partial += ', "reasoning": "Generated SQL query"'
      }
      if (!hasChart) {
        partial += ', "chart": { "type": "table", "xField": null, "yField": null }'
      }
      if (!hasPreviewSql && !hasSql && !hasActionSql) {
        partial += ', "preview_sql": null'
      }
      
      // Close the object
      partial += '}'
      repaired = partial
    } else {
      // No complete fields found, try to extract what we can
      // This will be handled by extractPartialJson
    }
  }

  // Fix common issues
  // Remove trailing commas
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1')

  // Fix unquoted keys
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')

  // Fix single quotes to double quotes (but preserve escaped quotes)
  repaired = repaired.replace(/(?<!\\)'/g, '"')

  // Try parsing again
  try {
    JSON.parse(repaired)
    return repaired
  } catch {
    // Try to fix truncated strings
    // If we have an incomplete string value, close it
    const incompleteStringMatch = repaired.match(/"([^"]*)$/)
    if (incompleteStringMatch) {
      // Find the last incomplete string and close it
      const lastQuote = repaired.lastIndexOf('"')
      const beforeLastQuote = repaired.substring(0, lastQuote)
      const afterLastQuote = repaired.substring(lastQuote + 1)
      
      // If after last quote doesn't have closing quote, add it
      if (!afterLastQuote.trim().startsWith('"') && !afterLastQuote.trim().startsWith(',')) {
        // Find where the string should end
        const stringEnd = afterLastQuote.search(/[,}\]]/)
        if (stringEnd > 0) {
          repaired = beforeLastQuote + '"' + afterLastQuote.substring(0, stringEnd) + '"' + afterLastQuote.substring(stringEnd)
        } else {
          // Just close the string and object
          repaired = beforeLastQuote + '"' + afterLastQuote + '"}'
        }
      }
    }
    
    // Last attempt: try to fix common escape issues
    repaired = repaired.replace(/\\"/g, '"')
    repaired = repaired.replace(/\\n/g, '\n')
    
    try {
      JSON.parse(repaired)
      return repaired
    } catch {
      // Final attempt: extract what we can and provide defaults
      return extractPartialJson(repaired)
    }
  }
}

/**
 * Extract partial JSON and provide defaults for missing fields
 * Handles truncated string values
 */
function extractPartialJson(jsonString: string): string | null {
  try {
    // Try to extract known fields (handle truncated strings)
    // Match even if string is not closed
    const previewSqlMatch = jsonString.match(/"preview_sql"\s*:\s*"([^"]*)"?/)
    const actionSqlMatch = jsonString.match(/"action_sql"\s*:\s*"([^"]*)"?/)
    const sqlMatch = jsonString.match(/"sql"\s*:\s*"([^"]*)"?/)
    const reasoningMatch = jsonString.match(/"reasoning"\s*:\s*"([^"]*)"?/)
    
    // Extract values (may be truncated)
    let previewSql = previewSqlMatch ? previewSqlMatch[1] : (sqlMatch ? sqlMatch[1] : null)
    const actionSql = actionSqlMatch ? actionSqlMatch[1] : null
    let reasoning = reasoningMatch ? reasoningMatch[1] : null
    
    // If reasoning is truncated (ends without closing quote), extract what we can
    if (!reasoning) {
      const reasoningStart = jsonString.indexOf('"reasoning"')
      if (reasoningStart > 0) {
        const afterColon = jsonString.indexOf(':', reasoningStart)
        if (afterColon > 0) {
          const valueStart = jsonString.indexOf('"', afterColon) + 1
          if (valueStart > 0) {
            // Extract everything after the opening quote until end of string
            reasoning = jsonString.substring(valueStart).trim()
            // Remove any trailing incomplete parts
            if (reasoning.endsWith('"')) {
              reasoning = reasoning.slice(0, -1)
            }
          }
        }
      }
    }
    
    // If preview_sql is truncated, extract what we can
    if (previewSql && !previewSql.endsWith('"')) {
      // SQL might be truncated, but we can still use it
      previewSql = previewSql.trim()
    }
    
    // Build minimal valid JSON
    const minimalJson: {
      preview_sql: string | null
      action_sql: string | null
      reasoning: string
      chart: { type: string; xField: string | null; yField: string | null }
    } = {
      preview_sql: previewSql || null,
      action_sql: actionSql || null,
      reasoning: reasoning || 'Generated SQL query',
      chart: {
        type: 'table',
        xField: null,
        yField: null,
      },
    }
    
    // If we have SQL, return it (even if truncated)
    if (previewSql || actionSql) {
      return JSON.stringify(minimalJson)
    }
    
    return null
  } catch {
    return null
  }
}

