/**
 * Centralized file/message/history size limits. Previously duplicated as magic numbers across
 * app/api/contracts/route.ts, lib/validation/contracts.ts, and lib/openai/chat.ts.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB — matches the `contracts` storage bucket's file_size_limit
export const MAX_PAGE_COUNT = 20 // pdf-upload-spec.md — intentionally stricter than a generic default; keeps OpenAI cost per contract bounded
export const MIN_EXTRACTED_WORDS = 100 // below this, treat the PDF as a scanned/image file with no usable text layer
export const MAX_CONTRACT_TOKENS = 15000 // estimateTokens() ceiling — soft cost budget, not a hard API constraint
export const MAX_MESSAGE_LENGTH = 2000 // chat composer max, enforced by chatMessageSchema

/** Hard ceiling on chat_messages rows pulled from the DB to build a single prompt turn. */
export const MAX_CHAT_HISTORY = Number(process.env.MAX_CHAT_HISTORY ?? 200)
