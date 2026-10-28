// Mirrors docs/openapi.yaml (the spec of record). Keep in sync with docs/API_CONTRACT.md.
export type LangCode = 'en' | 'tw' | 'gaa' | 'ee' | 'fat' | 'dag' | 'pcm'
export type Intent = 'general_question' | 'account_issue' | 'human_request' | 'other'
export type Role = 'owner' | 'admin' | 'agent'
export type TicketStatus = 'open' | 'needs_human' | 'resolved'
export type ConversationStatus = 'ai' | 'needs_human' | 'human' | 'resolved'

export interface LogLine {
  id: string
  time: string
  level: 'info' | 'warn' | 'error' | 'debug'
  method: string | null
  path: string | null
  status: number | null
  durationMs: number | null
  traceId: string | null
  error: { message: string; code: string | null } | null
  response: string | null
}
export interface TraceStep { step: string; ms: number; [detail: string]: unknown }
export interface RootCause { summary: string; suggestedFix: string; citedLines: string[]; confidence: number }
export interface RoundTrip { backTranslation: string; similarity: number; reviewRecommended: boolean; provider: 'khaya' | 'gemma' | 'none' }
export interface Understanding { language: LangCode; languageName: string; english: string; intent: Intent }

export interface SupportResponse {
  verified: boolean
  user: { id: string; name: string | null } | null
  requiresAuth: boolean
  needsHuman: boolean
  understanding: Understanding
  reply: { language: LangCode; english: string; text: string }
  roundTrip: RoundTrip | null
  evidence: LogLine[] | null
  rootCause: RootCause | null
  ticketId: string | null
  trace: TraceStep[]
  conversationId: string
  messageId: string
  handledBy: 'ai' | 'human'
  held?: boolean
}
export interface VoiceResponse extends SupportResponse {
  transcript: string
  replyAudio: { mimeType: string; base64: string } | null
}

export interface Capabilities {
  brand: string
  demoMode: boolean
  signupEnabled: boolean
  model: string
  capabilities: { model: boolean; languageLayer: 'khaya' | 'model-fallback'; voice: boolean; logs: boolean; identity: boolean }
  languages: { code: LangCode; name: string }[]
  demoUsers?: { id: string; name: string }[]
  demoLogin?: { email: string; password: string }
}

export interface Note { id: string; ticketId: string; authorId: string | null; text: string; createdAt: string }
export interface Ticket {
  id: string; createdAt: string; updatedAt: string; status: TicketStatus; priority: 'low' | 'normal' | 'high' | 'urgent'
  assigneeId: string | null; conversationId: string | null; title: string; userId: string | null; language: LangCode
  customerMessage: string; replyEnglish: string; rootCause: RootCause | null; evidence: LogLine[]; notes?: Note[]
}
export interface Page<T> { data: T[]; nextCursor: string | null }

export interface Message {
  id: string; conversationId: string; role: 'customer' | 'ai' | 'agent'; text: string; english: string | null; language: string | null
  intent: string | null; status: 'sent' | 'pending_review' | 'rejected'; reviewRecommended: boolean
  meta: { roundTrip?: RoundTrip | null; evidence?: LogLine[] | null; rootCause?: RootCause | null; trace?: TraceStep[]; understanding?: Understanding; ticketId?: string | null }
  authorId: string | null; createdAt: string
}
export interface Conversation {
  id: string; customerId: string | null; customerName: string | null; language: LangCode; status: ConversationStatus; handedOff: boolean
  assigneeId: string | null; firstResponseMs: number | null; createdAt: string; updatedAt: string; lastMessage?: string | null; messageCount?: number
}
export interface ConversationDetail extends Conversation { messages: Message[]; ticketIds: string[] }

export interface WorkspaceSettings { languages: LangCode[]; escalationThreshold: number; retentionDays: number; holdFlaggedReplies: boolean; brandColor: string; aiLive: boolean }
export interface Workspace { id: string; name: string; slug: string; publicKey: string; settings: WorkspaceSettings; createdAt: string }
export interface User { id: string; email: string; name: string | null }
export interface Session { session: string; expiresAt: string; user: User; role: Role; workspace: Workspace }
export interface Member { id: string; email: string; name: string | null; role: Role; createdAt: string }
export interface Invitation { id: string; email: string; role: Role; expiresAt: string }
export interface ApiKey { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }
export interface Webhook { id: string; url: string; events: string[]; createdAt: string }
export interface Delivery { id: string; event: string; status: 'pending' | 'delivered' | 'failed'; attempts: number; responseStatus: number | null; error: string | null; createdAt: string }
export interface AuditEvent { id: string; actorType: string; actorId: string | null; action: string; detail: Record<string, unknown>; createdAt: string }
export interface KnowledgeDoc { id: string; title: string; chunks: number; createdAt: string; updatedAt?: string; text?: string }
export interface LogSource { source: 'workspace' | 'environment' | null; baseUrl: string | null; service: string | null; userIdField: string; apiKeyMasked: string | null }
export interface LogSourceTest { ok: boolean; sampleCount: number; issues: { code: string; message: string }[] }
export interface AnalyticsSummary {
  conversations: number; resolvedByAI: number; handedOff: number; handoffRate: number; avgFirstResponseMs: number | null
  languages: { code: string; count: number }[]; intents: { intent: string; count: number }[]; reviewRate: number
  topRootCauses: { fingerprint: string; summary: string | null; count: number; lastSeen: string }[]; ticketsNeedingHuman: number
}
export interface PendingReply { id: string; conversationId: string; role: 'ai' | 'agent'; text: string; english: string | null; language: string | null; roundTrip: RoundTrip | null; customerMessage: string | null; createdAt: string }

export interface Channel { id: string; kind: 'chatflow'; label: string; externalId: string; status: 'pending' | 'connected' | 'error'; lastSeenAt: string | null; keyPrefix: string; createdAt: string }
export interface ChannelCreated extends Channel { relayKey: string }
export interface ChannelTest { ok: boolean; issues: { code: string; message: string }[] }
