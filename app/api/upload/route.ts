import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import * as XLSX from 'xlsx'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { prisma } from '@/lib/db/client'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Sanitize table name to be valid PostgreSQL identifier
function sanitizeTableName(fileName: string): string {
  // Remove extension
  let name = fileName.replace(/\.(csv|xlsx|xls)$/i, '')
  // Replace invalid characters with underscore
  name = name.replace(/[^a-z0-9_]/gi, '_')
  // Ensure it starts with a letter
  if (!/^[a-z]/i.test(name)) {
    name = 'table_' + name
  }
  // Convert to lowercase
  name = name.toLowerCase()
  // Limit length
  if (name.length > 63) {
    name = name.substring(0, 63)
  }
  // Ensure uniqueness by appending timestamp
  const timestamp = Date.now().toString().slice(-6)
  return `${name}_${timestamp}`
}

// Infer PostgreSQL type from JavaScript value
function inferPostgresType(value: any): string {
  if (value === null || value === undefined || value === '') {
    return 'TEXT'
  }
  
  const str = String(value).trim()
  
  // Check for integer
  if (/^-?\d+$/.test(str)) {
    return 'INTEGER'
  }
  
  // Check for decimal/numeric
  if (/^-?\d+\.\d+$/.test(str)) {
    return 'NUMERIC'
  }
  
  // Check for boolean
  if (/^(true|false|yes|no|1|0)$/i.test(str)) {
    return 'BOOLEAN'
  }
  
  // Check for date/timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(str) || /^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    return 'TIMESTAMP'
  }
  
  // Default to text
  return 'TEXT'
}

// Determine column type from all values in column
function determineColumnType(values: any[]): string {
  const types = values
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(v => inferPostgresType(v))
  
  // Priority: NUMERIC > INTEGER > TIMESTAMP > BOOLEAN > TEXT
  if (types.some(t => t === 'NUMERIC')) return 'NUMERIC'
  if (types.some(t => t === 'INTEGER')) return 'INTEGER'
  if (types.some(t => t === 'TIMESTAMP')) return 'TIMESTAMP'
  if (types.some(t => t === 'BOOLEAN')) return 'BOOLEAN'
  return 'TEXT'
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Save file to temp directory
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const tempPath = join(tmpdir(), `upload_${Date.now()}_${file.name}`)
    await writeFile(tempPath, buffer)

    let rows: any[] = []
    let headers: string[] = []

    try {
      // Parse file based on extension
      const fileExtension = file.name.toLowerCase().split('.').pop()

      if (fileExtension === 'csv') {
        // Parse CSV
        const csvContent = readFileSync(tempPath, 'utf-8')
        const records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }) as Record<string, any>[]
        rows = records
        headers = records.length > 0 ? Object.keys(records[0] as Record<string, any>) : []
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        // Parse Excel
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false })
        rows = jsonData
        headers = rows.length > 0 ? Object.keys(rows[0]) : []
      } else {
        throw new Error('Unsupported file type')
      }

      if (rows.length === 0) {
        throw new Error('File is empty or has no data rows')
      }

      if (headers.length === 0) {
        throw new Error('File has no column headers')
      }

      // Sanitize column names
      const sanitizedHeaders = headers.map(h => {
        let name = h.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
        if (!/^[a-z]/.test(name)) {
          name = 'col_' + name
        }
        if (name.length > 63) {
          name = name.substring(0, 63)
        }
        return name
      })

      // Determine column types
      const columnTypes: Record<string, string> = {}
      for (const header of sanitizedHeaders) {
        const originalHeader = headers[sanitizedHeaders.indexOf(header)]
        const columnValues = rows.map(row => row[originalHeader])
        columnTypes[header] = determineColumnType(columnValues)
      }

      // Generate table name
      const tableName = sanitizeTableName(file.name)

      // Create table in PostgreSQL
      const client = await pool.connect()
      try {
        // Build CREATE TABLE statement
        const columnDefs = sanitizedHeaders
          .map((col, idx) => {
            const pgType = columnTypes[col]
            return `"${col}" ${pgType}`
          })
          .join(', ')

        const createTableSQL = `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnDefs})`
        await client.query(createTableSQL)

        // Insert data in batches
        const batchSize = 1000
        for (let batchStart = 0; batchStart < rows.length; batchStart += batchSize) {
          const batch = rows.slice(batchStart, batchStart + batchSize)
          const placeholders: string[] = []
          const values: any[] = []

          for (let rowIdx = 0; rowIdx < batch.length; rowIdx++) {
            const row = batch[rowIdx]
            const rowValues: any[] = []
            for (const originalHeader of headers) {
              const sanitizedHeader = sanitizedHeaders[headers.indexOf(originalHeader)]
              let value = row[originalHeader]

              // Convert value based on type
              if (value === null || value === undefined || value === '') {
                rowValues.push(null)
              } else if (columnTypes[sanitizedHeader] === 'INTEGER') {
                rowValues.push(parseInt(String(value), 10) || null)
              } else if (columnTypes[sanitizedHeader] === 'NUMERIC') {
                rowValues.push(parseFloat(String(value)) || null)
              } else if (columnTypes[sanitizedHeader] === 'BOOLEAN') {
                const str = String(value).toLowerCase()
                rowValues.push(str === 'true' || str === 'yes' || str === '1')
              } else if (columnTypes[sanitizedHeader] === 'TIMESTAMP') {
                rowValues.push(new Date(String(value)).toISOString())
              } else {
                rowValues.push(String(value))
              }
            }
            values.push(...rowValues)
            const paramStart = rowIdx * sanitizedHeaders.length + 1
            const placeholdersRow = sanitizedHeaders.map((_, idx) => `$${paramStart + idx}`).join(', ')
            placeholders.push(`(${placeholdersRow})`)
          }

          const insertSQL = `INSERT INTO "${tableName}" (${sanitizedHeaders.map(h => `"${h}"`).join(', ')}) VALUES ${placeholders.join(', ')}`
          await client.query(insertSQL, values)
        }

        // Get final row count - handle BigInt
        const countResult = await client.query(`SELECT COUNT(*) as count FROM "${tableName}"`)
        const countValue = countResult.rows[0].count
        const rowCount = typeof countValue === 'bigint' 
          ? Number(countValue <= Number.MAX_SAFE_INTEGER ? countValue : countValue.toString())
          : parseInt(String(countValue), 10)

        return NextResponse.json({
          success: true,
          tableName,
          rowCount,
          columns: sanitizedHeaders,
          message: `Successfully created table "${tableName}" with ${rowCount} rows`,
        })
      } finally {
        client.release()
      }
    } finally {
      // Clean up temp file
      try {
        await unlink(tempPath)
      } catch (error) {
        console.error('Failed to delete temp file:', error)
      }
    }
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process file' },
      { status: 500 }
    )
  }
}

