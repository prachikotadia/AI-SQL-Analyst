import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import * as XLSX from 'xlsx'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { registerFile } from '@/lib/data/fileRegistry'

// Parse CSV/Excel file
async function parseFile(file: File): Promise<{ data: any[]; headers: string[]; columns: Array<{ name: string; type: string }> }> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const tempPath = join(tmpdir(), `attachment_${Date.now()}_${file.name}`)

  try {
    await writeFile(tempPath, buffer)
    const fileExtension = file.name.toLowerCase().split('.').pop()

    let rows: any[] = []
    let headers: string[] = []

    if (fileExtension === 'csv') {
      const csvContent = readFileSync(tempPath, 'utf-8')
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, any>[]
      rows = records
      headers = records.length > 0 ? Object.keys(records[0] as Record<string, any>) : []
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false })
      rows = jsonData
      headers = rows.length > 0 ? Object.keys(rows[0]) : []
    } else {
      throw new Error('Unsupported file type')
    }

    // Infer column types
    const columns = headers.map(header => {
      const values = rows.map(row => row[header]).filter(v => v != null && v !== '')
      let type = 'text'
      
      if (values.length > 0) {
        const firstValue = values[0]
        if (typeof firstValue === 'number' || !isNaN(Number(firstValue))) {
          type = Number.isInteger(Number(firstValue)) ? 'integer' : 'decimal'
        } else if (firstValue instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(firstValue))) {
          type = 'timestamp'
        } else if (typeof firstValue === 'boolean' || /^(true|false|yes|no)$/i.test(String(firstValue))) {
          type = 'boolean'
        }
      }

      return { name: header, type }
    })

    return { data: rows, headers, columns }
  } finally {
    try {
      await unlink(tempPath)
    } catch (error) {
      console.error('Failed to delete temp file:', error)
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    const validExtensions = ['.csv', '.xlsx', '.xls']
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    if (!validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload CSV or Excel files.' },
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    const { data, headers, columns } = await parseFile(file)

    if (data.length === 0) {
      return NextResponse.json({
        error: 'File is empty or has no data rows',
      }, { status: 400 })
    }

    // Generate table name from filename
    const tableName = file.name.replace(/\.(csv|xlsx|xls)$/i, '').replace(/[^a-z0-9_]/gi, '_').toLowerCase()

    // Register file and get ID
    const fileId = registerFile({
      fileName: file.name,
      tableName,
      columns,
      data,
      uploadedAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      fileId,
      fileName: file.name,
      tableName,
      rowCount: data.length,
      columns: columns.map(c => ({ name: c.name, type: c.type })),
    })
  } catch (error: any) {
    console.error('Attachment upload error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process file' },
      { status: 500 }
    )
  }
}

