/**
 * @typedef {Object} SseRequestContext
 * @property {string} [method] HTTP method, without request body or credentials.
 * @property {number} [httpStatus] Script-visible response status.
 *
 * @typedef {SseRequestContext & Object} SseMetadata
 * @property {'sse'} protocol
 * @property {'fetch'|'EventSource'} sseSource
 * @property {string} [eventName] Event name supplied by the server.
 * @property {string} [lastEventId] Server ID, independent of the local message ID.
 * @property {number} [retry] Server retry hint when available.
 *
 * @typedef {SseMetadata & Object} SseCaptureEvent
 * @property {string} id Local connection ID.
 * @property {string} messageId Unique local event ID.
 * @property {string} url Script-visible connection URL.
 * @property {string} type Connection, message, lifecycle or truncation event.
 * @property {number} timestamp Observation time in milliseconds.
 * @property {string} [data] Complete event data or truncation reason.
 * @property {string} [status] Observed lifecycle state.
 */
export {};
