import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink, readFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import * as XLSX from 'xlsx'
import { parse } from 'csv-parse/sync'
import Busboy from 'busboy'
import { registerFile } from '@/lib/data/fileRegistry'

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

function parseMultipartFormData(req: NextRequest): Promise<{ file: { name: string; buffer: Buffer }; chatId: string }> {
  return new Promise(async (resolve, reject) => {
    try {
      const contentType = req.headers.get('content-type') || ''
      const busboy = Busboy({ headers: { 'content-type': contentType } })

      let file: { name: string; buffer: Buffer } | null = null
      let chatId: string | null = null
      const chunks: Buffer[] = []

      busboy.on('file', (name, fileStream, info) => {
        if (name === 'file') {
          const { filename } = info
          fileStream.on('data', (chunk: Buffer) => {
            chunks.push(chunk)
          })
          fileStream.on('end', () => {
            if (filename) {
              file = { name: filename, buffer: Buffer.concat(chunks) }
            }
          })
        }
      })

      busboy.on('field', (name, value) => {
        if (name === 'chatId') {
          chatId = value
        }
      })

      busboy.on('finish', () => {
        if (!file) {
          reject(new Error('No file provided'))
          return
        }
        if (!chatId) {
          reject(new Error('chatId is required'))
          return
        }
        resolve({ file, chatId })
      })

      busboy.on('error', (err) => {
        reject(err)
      })

      if (req.body) {
        const reader = req.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              busboy.end()
              break
            }
            busboy.write(value)
          }
        } catch (err) {
          reject(err)
        }
      } else {
        reject(new Error('Request body is null'))
      }
    } catch (err) {
      reject(err)
    }
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let file: { name: string; buffer: Buffer }
    let chatId: string

    try {
      const parsed = await parseMultipartFormData(req)
      file = parsed.file
      chatId = parsed.chatId
    } catch (parseError: unknown) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'Failed to parse form data'
      if (process.env.NODE_ENV === 'development') {
        console.error('[Attachments API] Parse error:', errorMessage)
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[Attachments API] Received file:', file.name, 'Size:', file.buffer.length)
    }

    const validExtensions = ['.csv', '.xlsx', '.xls']
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    
    if (!validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload CSV or Excel files.' },
        { status: 400 }
      )
    }

    if (file.buffer.length > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    let data: any[] = []
    let headers: string[] = []
    let columns: Array<{ name: string; type: string }> = []

    try {
      const parsed = await parseFileBuffer(file.buffer, file.name)
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
