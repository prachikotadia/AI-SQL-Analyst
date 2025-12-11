import { NextRequest, NextResponse } from 'next/server'
import {
  createChat,
  getChat,
  getAllChats,
  updateChatTitle,
  deleteChat,
  getChatFiles,
  addFileToChat,
  removeFileFromChat,
  getChatMessages,
} from '@/lib/data/chatStore'
import { getFilesByIds } from '@/lib/data/fileRegistry'

/**
 * GET /api/chats - Get all chats
 */
export async function GET(request: NextRequest) {
  try {
    const chats = getAllChats()
    return NextResponse.json({
      chats: (chats || []).map(chat => ({
        chatId: chat.chatId,
        title: chat.title || 'New Chat',
        updatedAt: chat.updatedAt || new Date().toISOString(),
        messageCount: chat.messages?.length || 0,
        fileCount: chat.attachedFiles?.length || 0,
      })),
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch chats'
    // Return empty array instead of error to prevent 500 on page load
    return NextResponse.json({
      chats: [],
      error: errorMessage,
    }, { status: 200 })
  }
}

/**
 * POST /api/chats - Create a new chat
 */
export async function POST(request: NextRequest) {
  try {
    const chatId = createChat()
    return NextResponse.json({ chatId })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create chat'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/chats - Update chat (title, files, etc.)
 * If chat doesn't exist, creates it (never returns 404)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { chatId, title, fileIds, action } = body

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId is required' },
        { status: 400 }
      )
    }

    // Get or create chat (never return 404)
    let chat = getChat(chatId)
    let actualChatId = chatId
    
    if (!chat) {
      // Create chat if it doesn't exist
      actualChatId = createChat(chatId.startsWith('chat_') ? chatId : undefined)
      chat = getChat(actualChatId)
      // If still null, create with generated ID
      if (!chat) {
        actualChatId = createChat()
        chat = getChat(actualChatId)
      }
    }
    
    // Ensure we have a valid chat
    if (!chat) {
      return NextResponse.json(
        { error: 'Failed to create or retrieve chat' },
        { status: 500 }
      )
    }

    // Use the actual chat ID (may differ from requested if chat was created)
    if (title) {
      updateChatTitle(actualChatId, title)
    }

    if (action === 'addFile' && fileIds && Array.isArray(fileIds)) {
      const files = getFilesByIds(fileIds)
      
      // CRITICAL: Always add files to chatStore, even if fileRegistry is empty
      // This ensures files persist across serverless resets
      if (files.length > 0) {
        for (const file of files) {
          addFileToChat(actualChatId, file)
        }
      } else if (fileIds.length > 0) {
        // FileRegistry is empty - this is a serverless reset scenario
        // The file should be in chatStore from a previous request if it was added before
        // Check if chat already has these files
        const chat = getChat(actualChatId)
        if (chat) {
          const existingFileIds = chat.attachedFiles.map(f => f.id)
          const missingFileIds = fileIds.filter(id => !existingFileIds.includes(id))
          if (missingFileIds.length > 0) {
            // Files were uploaded but lost - user will need to re-upload
          }
        }
      }
    }

    if (action === 'removeFile' && fileIds && Array.isArray(fileIds)) {
      // Remove files from chat (works even if fileRegistry is empty)
      for (const fileId of fileIds) {
        removeFileFromChat(actualChatId, fileId)
      }
      
      // Also remove from fileRegistry if it exists there
      try {
        const { deleteFile } = await import('@/lib/data/fileRegistry')
        for (const fileId of fileIds) {
          deleteFile(fileId)
        }
      } catch (error) {
        // FileRegistry might not have the file - that's okay
      }
    }

    const updatedChat = getChat(actualChatId)
    return NextResponse.json({
      chat: {
        chatId: updatedChat!.chatId,
        title: updatedChat!.title,
        updatedAt: updatedChat!.updatedAt,
        attachedFiles: updatedChat!.attachedFiles.map(f => ({
          id: f.id,
          fileName: f.fileName,
          rowCount: f.data.length,
          tableName: f.tableName,
        })),
      },
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update chat'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/chats/[chatId] - Delete a chat
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const chatId = searchParams.get('chatId')

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId is required' },
        { status: 400 }
      )
    }

    deleteChat(chatId)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete chat'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

