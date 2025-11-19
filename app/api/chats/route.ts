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
      chats: chats.map(chat => ({
        chatId: chat.chatId,
        title: chat.title,
        updatedAt: chat.updatedAt,
        messageCount: chat.messages.length,
        fileCount: chat.attachedFiles.length,
      })),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch chats' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/chats - Create a new chat
 */
export async function POST(request: NextRequest) {
  try {
    const chatId = createChat()
    return NextResponse.json({ chatId })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create chat' },
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
      for (const file of files) {
        addFileToChat(actualChatId, file)
      }
    }

    if (action === 'removeFile' && fileIds && Array.isArray(fileIds)) {
      for (const fileId of fileIds) {
        removeFileFromChat(actualChatId, fileId)
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update chat' },
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete chat' },
      { status: 500 }
    )
  }
}

