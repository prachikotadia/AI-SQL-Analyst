import { NextRequest, NextResponse } from 'next/server'
import { getFileById } from '@/lib/data/fileRegistry'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    
    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId is required' },
        { status: 400 }
      )
    }

    // Get file from disk storage
    const file = getFileById(fileId)
    
    if (!file) {
      return NextResponse.json(
        { error: 'File not found. The file may have been deleted or the server was restarted.' },
        { status: 404 }
      )
    }

    // Limit data to first 1000 rows for performance in the modal
    const limitedData = file.data && file.data.length > 1000 
      ? file.data.slice(0, 1000)
      : (file.data || [])

    return NextResponse.json({
      id: file.id,
      fileName: file.fileName,
      tableName: file.tableName,
      columns: file.columns || [],
      data: limitedData,
      rowCount: file.data?.length || 0,
      displayedRowCount: limitedData.length,
      uploadedAt: file.uploadedAt instanceof Date 
        ? file.uploadedAt.toISOString() 
        : file.uploadedAt,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch file' },
      { status: 500 }
    )
  }
}

