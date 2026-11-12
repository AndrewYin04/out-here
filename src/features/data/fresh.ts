// Header a client sends on a refetch that a realtime message triggered, so the server reads the
// database instead of a snapshot cached before the write that caused the message. Client-safe.
export const FRESH_HEADER = 'x-outhere-fresh';
