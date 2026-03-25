/**
 * errors.ts — Type-safe error handling utilities for Percolator services.
 *
 * Provides structured error types and type guards to replace generic `unknown`
 * error typing throughout the codebase, and the `getErrorMessage` helper used
 * by keeper services.
 */
export function isApiError(e) {
    return (typeof e === "object" &&
        e !== null &&
        typeof e.status === "number" &&
        typeof e.code === "string" &&
        typeof e.message === "string");
}
export function isValidationError(e) {
    return (typeof e === "object" &&
        e !== null &&
        typeof e.code === "string" &&
        typeof e.message === "string");
}
export function isRpcError(e) {
    return (typeof e === "object" &&
        e !== null &&
        typeof e.code === "number" &&
        typeof e.message === "string");
}
/**
 * Extract a safe error message from any error type.
 * Always returns a non-empty string — safe to log or send to Discord alerts.
 */
export function getErrorMessage(e) {
    if (isApiError(e))
        return e.message;
    if (isValidationError(e))
        return e.message;
    if (e instanceof Error)
        return e.message;
    if (typeof e === "object" && e !== null) {
        const msg = e.message;
        if (typeof msg === "string")
            return msg;
    }
    if (typeof e === "string")
        return e;
    return "Unknown error";
}
export function getErrorCode(e) {
    if (isApiError(e))
        return e.code;
    if (isValidationError(e))
        return e.code;
    if (isRpcError(e))
        return `RPC_${e.code}`;
    return "UNKNOWN";
}
export function toApiError(input, defaultStatus = 500, context) {
    if (isApiError(input)) {
        return { ...input, context: { ...input.context, ...context } };
    }
    if (isValidationError(input)) {
        return {
            status: 400,
            code: input.code,
            message: input.message,
            context: { ...input.context, ...context, fields: input.fields },
        };
    }
    if (input instanceof Error) {
        return { status: defaultStatus, code: input.name || "ERROR", message: input.message, context, cause: input };
    }
    return { status: defaultStatus, code: "UNKNOWN", message: getErrorMessage(input), context };
}
export function createValidationError(code, message, fields, context) {
    return { code, message, fields, context };
}
