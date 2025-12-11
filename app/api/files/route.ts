import { NextRequest, NextResponse } from 'next/server'
import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { existsSync } from 'fs'
import { prisma } from '@/lib/db/client'

const uploadedFiles = new Map<string, {
  fileName: string
  tableName: string
  filePath: string
  uploadedAt: Date
  rowCount: number
}>()

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') // 'list' or 'download'
    const fileName = searchParams.get('fileName')
    const tableName = searchParams.get('tableName')

    // List all uploaded files
    if (action === 'list' || !action) {
      // Get files from database tables (tables created from uploads)
      const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name NOT LIKE '_prisma%'
          AND table_name NOT IN ('products', 'customers', 'orders', 'order_items')
        ORDER BY table_name DESC
      `

      const fileList = await Promise.all(
        tables.map(async (table) => {
          try {
            const countResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
              `SELECT COUNT(*) as count FROM "${table.table_name}"`
            )
            const rowCount = Number(countResult[0]?.count || 0)
            
            return {
              tableName: table.table_name,
              fileName: table.table_name.replace(/_/g, ' ').replace(/\d+$/, '') + '.csv', // Approximate filename
              rowCount,
              uploadedAt: new Date().toISOString(), // Approximate
            }
          } catch (error) {
            return null
          }
        })
      )

      return NextResponse.json({
        files: fileList.filter(Boolean),
      })
    }

    // Download file - export table data as CSV
    if (action === 'download' && tableName) {
      try {
        // Get all data from the table
        const data = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
          `SELECT * FROM "${tableName}" LIMIT 10000`
        )

        if (data.length === 0) {
          return NextResponse.json(
            { error: 'Table is empty' },
            { status: 404 }
          )
        }

        // Get column names
        const columns = Object.keys(data[0])

        // Convert to CSV
        const csvRows = [
          columns.join(','), // Header
          ...data.map(row =>
            columns.map(col => {
              const value = row[col]
              // Escape commas and quotes in CSV
              if (value === null || value === undefined) return ''
              const str = String(value)
              if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`
              }
              return str
            }).join(',')
          ),
        ]

        const csvContent = csvRows.join('\n')

        // Return as downloadable file
        return new NextResponse(csvContent, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${tableName}.csv"`,
          },
        })
      } catch (error: any) {
        return NextResponse.json(
          { error: `Failed to export table: ${error.message}` },
          { status: 500 }
        )
      }
    }

    if (action === 'view' && tableName) {
      return NextResponse.redirect(new URL(`/files/${tableName}`, request.url))
    }

    return NextResponse.json(
      { error: 'Invalid action. Use action=list, action=download, or action=view' },
      { status: 400 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to process request: ${error.message}` },
      { status: 500 }
    )
  }
}

