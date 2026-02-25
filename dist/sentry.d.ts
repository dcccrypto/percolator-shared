import * as Sentry from "@sentry/node";
/**
 * Initialize Sentry for a backend service.
 * Only initializes if SENTRY_DSN env var is set.
 *
 * @param service - Service name (e.g. "api", "keeper", "indexer")
 */
export declare function initSentry(service: string): void;
/**
 * Capture an exception to Sentry.
 * Safe to call even if Sentry is not initialized.
 */
export declare function captureException(error: Error | unknown, context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: Sentry.SeverityLevel;
}): string;
/**
 * Capture a message to Sentry.
 * Safe to call even if Sentry is not initialized.
 */
export declare function captureMessage(message: string, context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: Sentry.SeverityLevel;
}): string;
/**
 * Add a breadcrumb for tracking important operations.
 * Breadcrumbs appear in Sentry when an error occurs.
 */
export declare function addBreadcrumb(message: string, data?: Record<string, unknown>, level?: Sentry.SeverityLevel): void;
/**
 * Set a tag for all future events in this scope.
 */
export declare function setTag(key: string, value: string): void;
/**
 * Set user context for all future events.
 */
export declare function setUser(user: {
    id?: string;
    [key: string]: unknown;
}): void;
/**
 * Clear user context.
 */
export declare function clearUser(): void;
