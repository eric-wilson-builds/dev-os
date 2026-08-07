import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require-user'
import { getOwnedContract } from '@/lib/db/contracts'
import { getChatSession, getOrCreateChatSession, getMessages, getRecentMessages } from '@/lib/db/chat'
import { classifyQuery } from '@/lib/openai/classify-query'
import { streamChatCompletion } from '@/lib/openai/chat'
import { checkRateLimit } from '@/lib/security/rateLimiter'
import { verifyContractOwnership, verifySessionOwnership } from '@/lib/security/chatSecurity'
import { sanitizeForLLM } from '@/lib/security/promptInjectionGuard'
import { MAX_CHAT_HISTORY } from '@/lib/security/tokenLimiter'
import { apiError, UnauthorizedError, NotFoundError, RateLimitError } from '@/lib/api-error'
import { chatMessageSchema } from '@/lib/validation/contracts'

export async function GET(_req: NextRequest, { params }: { params: { contractId: string } }) {
  try {
    const user = await requireUser()
    const contract = await getOwnedContract(params.contractId, user.id)
    const session = await getChatSession(contract.id)

    if (!session) return NextResponse.json({ sessionId: null, messages: [] })

    const messages = await getMessages(session.id)
    return NextResponse.json({
      sessionId: session.id,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        page_citation: m.page_citation,
        created_at: m.created_at,
      })),
    })
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof NotFoundError) return apiError(404, 'not_found')
    throw err
  }
}

export async function POST(req: NextRequest, { params }: { params: { contractId: string } }) {
  try {
    const user = await requireUser()
    await checkRateLimit(user.id, 'chat')

    const contract = await verifyContractOwnership(params.contractId, user.id)
    if (contract.status !== 'completed') return apiError(422, 'invalid_state')

    const body = await req.json()
    const parsed = chatMessageSchema.safeParse(body)
    if (!parsed.success) return apiError(400, 'invalid_message')

    const sanitized = sanitizeForLLM(parsed.data.message)
    if (!sanitized.safe) return apiError(400, 'prompt_injection')

    const supabase = createClient()
    const session = await getOrCreateChatSession(contract.id, user.id)
    await verifySessionOwnership(session.id, user.id)

    // Load prior history BEFORE saving the new user message — otherwise the classifier and
    // retrieval would always see the current message as part of "history".
    const priorHistory = await getRecentMessages(session.id, MAX_CHAT_HISTORY)
    const classification = classifyQuery(parsed.data.message, priorHistory.length > 0)

    await supabase.from('chat_messages').insert({
      session_id: session.id,
      user_id: user.id,
      role: 'user',
      content: parsed.data.message,
    })

    const stream = await streamChatCompletion({
      contractText: contract.contract_text,
      history: priorHistory.map((m) => ({ role: m.role, content: m.content })),
      currentMessage: parsed.data.message,
      classification,
    })

    const encoder = new TextEncoder()

    return new Response(
      new ReadableStream({
        async start(controller) {
          let fullText = ''
          try {
            for await (const chunk of stream) {
              fullText += chunk
              controller.enqueue(encoder.encode(chunk))
            }

            const citationMatch = fullText.match(/\[Page (\d+)\]/)
            const pageCitation = citationMatch ? Number(citationMatch[1]) : null

            await supabase.from('chat_messages').insert({
              session_id: session.id,
              user_id: user.id,
              role: 'assistant',
              content: fullText,
              page_citation: pageCitation,
            })
          } catch {
            const fallback = 'Something went wrong generating a response — please try asking again.'
            controller.enqueue(encoder.encode(fullText ? `\n\n${fallback}` : fallback))

            await supabase.from('chat_messages').insert({
              session_id: session.id,
              user_id: user.id,
              role: 'assistant',
              content: fallback,
              page_citation: null,
            })
          } finally {
            controller.close()
          }
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } }
    )
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError(401, 'unauthorized')
    if (err instanceof NotFoundError) return apiError(404, 'not_found')
    if (err instanceof RateLimitError) {
      return apiError(429, 'rate_limited', undefined, { 'Retry-After': String(err.retryAfterSeconds) })
    }
    throw err
  }
}
