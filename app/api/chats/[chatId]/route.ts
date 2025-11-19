import { NextRequest, NextResponse } from 'next/server'
import { getChat, createChat } from '@/lib/data/chatStore'

/**
 * GET /api/chats/[chatId] - Get chat details and messages
 * If chat doesn't exist, creates a new one and returns it (never returns 404)
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    // In Next.js 15, params is a Promise and must be awaited
    const { chatId } = await context.params
    
    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId is required' },
        { status: 400 }
      )
    }
    
    let chat = getChat(chatId)

    // If chat doesn't exist, create a new one with the requested chatId (never return 404)
    if (!chat) {
      // Create new chat - if chatId is in valid format, try to use it, otherwise generate new
      const newChatId = createChat(chatId.startsWith('chat_') ? chatId : undefined)
      chat = getChat(newChatId)
    }

    // Final fallback: ensure we always have a chat
    if (!chat) {
      const fallbackId = createChat()
      chat = getChat(fallbackId)
    }

    // TypeScript guard: chat should never be null at this point, but add check for safety
    if (!chat) {
      // This should never happen, but handle it gracefully
      const emergencyId = createChat()
      const emergencyChat = getChat(emergencyId)
      if (!emergencyChat) {
        return NextResponse.json(
          { error: 'Failed to create chat' },
          { status: 500 }
        )
      }
      chat = emergencyChat
    }

    return NextResponse.json({
      chat: {
        chatId: chat.chatId,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        attachedFiles: chat.attachedFiles.map(f => ({
          id: f.id,
          fileName: f.fileName,
          rowCount: f.data.length,
          tableName: f.tableName,
        })),
        messages: chat.messages.map(msg => ({
          id: msg.id,
          timestamp: msg.timestamp,
          queryText: msg.queryText,
          summary: msg.summary,
          response: msg.response,
        })),
      },
    })
  } catch (error: any) {
    // Even on error, create a new chat and return it (never return 500/404)
    try {
      const fallbackId = createChat()
      const fallbackChat = getChat(fallbackId)
      if (fallbackChat) {
        return NextResponse.json({
          chat: {
            chatId: fallbackChat.chatId,
            title: fallbackChat.title,
            createdAt: fallbackChat.createdAt,
            updatedAt: fallbackChat.updatedAt,
            attachedFiles: [],
            messages: [],
          },
        })
      }
    } catch {
      // If even fallback fails, return minimal response
    }
    return NextResponse.json(
      { error: error.message || 'Failed to fetch chat' },
      { status: 500 }
    )
  }
}

