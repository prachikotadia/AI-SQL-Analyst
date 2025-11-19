import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/DataTable'
import type { ColumnMetadata } from '@/types'

interface PageProps {
  params: Promise<{
    tableName: string
  }>
}

export default async function FileViewPage({ params }: PageProps) {
  const { tableName } = await params

  try {
    const escapedTableName = tableName.replace(/"/g, '""')
    const tableCheck = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = '${escapedTableName}'`
    )

    if (tableCheck.length === 0) {
      notFound()
    }

    // Get data from table (limit to 1000 rows for performance)
    const data = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT * FROM "${tableName}" LIMIT 1000`
    )

    if (data.length === 0) {
      return (
        <div className="container mx-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>View File: {tableName}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">This table is empty.</p>
            </CardContent>
          </Card>
        </div>
      )
    }

    // Get column metadata
    const columns: ColumnMetadata[] = Object.keys(data[0]).map(key => {
      const sampleValue = data[0][key]
      let type = 'text'
      
      if (typeof sampleValue === 'number') {
        type = Number.isInteger(sampleValue) ? 'integer' : 'numeric'
      } else if (sampleValue instanceof Date) {
        type = 'timestamp'
      } else if (typeof sampleValue === 'boolean') {
        type = 'boolean'
      }

      return {
        name: key,
        type,
      }
    })

    // Convert BigInt values for JSON serialization
    const sanitizedData = data.map(row => {
      const sanitized: Record<string, any> = {}
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'bigint') {
          if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
            sanitized[key] = Number(value)
          } else {
            sanitized[key] = value.toString()
          }
        } else if (value instanceof Date) {
          sanitized[key] = value.toISOString()
        } else {
          sanitized[key] = value
        }
      }
      return sanitized
    })

    // Get total row count
    const countResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM "${tableName}"`
    )
    const totalCount = Number(countResult[0]?.count || 0)

    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">View File: {tableName}</CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Showing {sanitizedData.length} of {totalCount} rows
                  {totalCount > 1000 && ' (limited to first 1000 rows)'}
                </p>
              </div>
              <a
                href={`/api/files?action=download&tableName=${tableName}`}
                className="text-sm text-primary hover:underline"
                download
              >
                Download CSV
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable data={sanitizedData} columns={columns} />
          </CardContent>
        </Card>
      </div>
    )
  } catch (error: any) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">
              Failed to load table: {error.message || 'Unknown error'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }
}

