const isProd = process.env.NODE_ENV === "production";
/**
 * Serialize a value for JSON logging.
 * Error objects are not JSON-serializable (their properties are non-enumerable),
 * so JSON.stringify(new Error("x")) produces "{}". This function extracts
 * message, name, stack, and cause into a plain object.
 */
function serializeValue(value) {
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (value instanceof Error) {
        const obj = {
            message: value.message,
            name: value.name,
        };
        if (value.stack)
            obj.stack = value.stack;
        if (value.cause)
            obj.cause = serializeValue(value.cause);
        // Capture any custom properties (e.g., code, statusCode)
        for (const key of Object.getOwnPropertyNames(value)) {
            if (!(key in obj)) {
                obj[key] = serializeValue(value[key]);
            }
        }
        return obj;
    }
    if (Array.isArray(value)) {
        return value.map(serializeValue);
    }
    if (value !== null && typeof value === "object") {
        const obj = {};
        for (const [k, v] of Object.entries(value)) {
            obj[k] = serializeValue(v);
        }
        return obj;
    }
    return value;
}
/**
 * Walk a LogContext object and serialize any Error values found.
 */
function serializeContext(context) {
    const result = {};
    for (const [key, value] of Object.entries(context)) {
        result[key] = serializeValue(value);
    }
    return result;
}
/**
 * Format log entry for console output
 */
function formatPretty(entry) {
    const timestamp = new Date(entry.timestamp).toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context, (_key, val) => typeof val === "bigint" ? val.toString() : val)}` : "";
    return `[${timestamp}] ${level} [${entry.service}] ${entry.message}${contextStr}`;
}
/**
 * Create a structured logger for a service
 */
export function createLogger(service) {
    function log(level, message, context) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            service,
            message,
            context: context ? serializeContext(context) : undefined,
        };
        if (isProd) {
            // JSON output in production (BigInt-safe replacer as safety net)
            console.log(JSON.stringify(entry, (_key, val) => typeof val === "bigint" ? val.toString() : val));
        }
        else {
            // Pretty output in development
            console.log(formatPretty(entry));
        }
    }
    return {
        debug: (message, context) => log("debug", message, context),
        info: (message, context) => log("info", message, context),
        warn: (message, context) => log("warn", message, context),
        error: (message, context) => log("error", message, context),
    };
}
