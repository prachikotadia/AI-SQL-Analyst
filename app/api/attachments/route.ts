import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, readFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import * as XLSX from 'xlsx'
import { parse } from 'csv-parse/sync'
import { IncomingForm } from 'formidable'
import type { File as FormidableFile } from 'formidable'
import { registerFile } from '@/lib/data/fileRegistry'

export const config = {
  api: {
    bodyParser: false,
  },
}

interface ParsedFile {
  data: any[]
  headers: string[]
  columns: Array<{ name: string; type: string }>
}

async function parseFileBuffer(
  buffer: Buffer,
  fileName: string
): Promise<ParsedFile> {
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const tempPath = join(tmpdir(), `attachment_${Date.now()}_${sanitizedFileName}`)

  try {
    await writeFile(tempPath, buffer)
    const fileExtension = fileName.toLowerCase().split('.').pop()

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
    } catch {
      // Temp files auto-clean in serverless
    }
  }
}

function convertToFormidableRequest(req: NextRequest): any {
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key] = value
  })

  return {
    headers,
    method: req.method,
    url: req.url,
    readable: req.body || null,
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const chatId = formData.get('chatId') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId is required. File must be attached to a chat.' },
        { status: 400 }
      )
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[Attachments API] Received file:', file.name, 'Size:', file.size, 'Type:', file.type)
    }

    const validExtensions = ['.csv', '.xlsx', '.xls']
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    
    if (!validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload CSV or Excel files.' },
        { status: 400 }
      )
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let data: any[] = []
    let headers: string[] = []
    let columns: Array<{ name: string; type: string }> = []

    try {
      const parsed = await parseFileBuffer(buffer, file.name)
      data = parsed.data
      headers = parsed.headers
      columns = parsed.columns
    } catch (parseError: unknown) {
      const parseErrorMessage = parseError instanceof Error ? parseError.message : 'Failed to parse file'
      if (process.env.NODE_ENV === 'development') {
        console.error('[Attachments API] Parse error:', parseErrorMessage)
      }
      return NextResponse.json(
        { error: `Failed to parse file: ${parseErrorMessage}` },
        { status: 400 }
      )
    }

    if (data.length === 0) {
      return NextResponse.json({
        error: 'File is empty or has no data rows',
      }, { status: 400 })
    }

    const tableName = file.name.replace(/\.(csv|xlsx|xls)$/i, '').replace(/[^a-z0-9_]/gi, '_').toLowerCase()

    const fileMetadata = {
      fileName: file.name,
      tableName,
      columns,
      data,
      uploadedAt: new Date(),
    }
    const fileId = registerFile(fileMetadata)

    let actualChatId = chatId
    try {
      const { getChat, createChat, addFileToChat, getChatFiles } = await import('@/lib/data/chatStore')

      let chat = getChat(chatId)

      if (!chat) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Attachments API] Chat not found, creating new chat with ID:', chatId)
        }
        actualChatId = createChat(chatId.startsWith('chat_') ? chatId : undefined)
        chat = getChat(actualChatId)

        if (!chat) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[Attachments API] First create failed, trying again with generated ID')
          }
          actualChatId = createChat()
          chat = getChat(actualChatId)
        }
      }

      if (!chat) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[Attachments API] Failed to create chat after multiple attempts')
        }
        return NextResponse.json(
          { error: 'Failed to create or retrieve chat. Please try again.' },
          { status: 500 }
        )
      }

      const fullFileMetadata = { ...fileMetadata, id: fileId }

      if (process.env.NODE_ENV === 'development') {
        console.log('[Attachments API] Adding file to chat:', chat.chatId, 'File ID:', fileId)
      }

      addFileToChat(chat.chatId, fullFileMetadata)

      const verifyFiles = getChatFiles(chat.chatId)
      const fileExists = verifyFiles.some(f => f.id === fileId)

      if (!fileExists) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[Attachments API] File verification failed. Files in chat:', verifyFiles.map(f => f.id))
        }
        return NextResponse.json(
          { error: 'File was registered but failed to attach to chat. Please try again.' },
          { status: 500 }
        )
      }

      actualChatId = chat.chatId

      if (process.env.NODE_ENV === 'development') {
        console.log('[Attachments API] File successfully attached to chat:', actualChatId)
      }

      return NextResponse.json({
        success: true,
        fileId,
        fileName: file.name,
        tableName,
        rowCount: data.length,
        columns: columns.map(c => ({ name: c.name, type: c.type })),
        chatId: actualChatId || chatId,
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined

      if (process.env.NODE_ENV === 'development') {
        console.error('[Attachments API] Chat store error:', errorMessage, errorStack)
      }

      return NextResponse.json(
        {
          error: `Failed to attach file to chat: ${errorMessage}`,
          details: process.env.NODE_ENV === 'development' ? errorStack : undefined
        },
        { status: 500 }
      )
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to process file'
    const errorStack = error instanceof Error ? error.stack : undefined

    if (process.env.NODE_ENV === 'development') {
      console.error('[Attachments API] Error:', errorMessage, errorStack)
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    )
  }
}
