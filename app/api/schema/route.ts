import { NextResponse } from 'next/server'
import { getDatabaseSchema } from '@/lib/db/schema'

export async function GET() {
  try {
    const schema = await getDatabaseSchema()
    return NextResponse.json({ schema })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch schema' },
      { status: 500 }
    )
  }
}

