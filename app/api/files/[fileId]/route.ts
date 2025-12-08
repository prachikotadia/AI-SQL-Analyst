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

    const file = getFileById(fileId)
    
    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: file.id,
      fileName: file.fileName,
      tableName: file.tableName,
      columns: file.columns,
      data: file.data,
      rowCount: file.data.length,
      uploadedAt: file.uploadedAt,
    })
  } catch (error: any) {
    console.error('Error fetching file:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch file' },
      { status: 500 }
    )
  }
}

