export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LogContext {
    [key: string]: unknown;
}
export interface Logger {
    debug: (message: string, context?: LogContext) => void;
    info: (message: string, context?: LogContext) => void;
    warn: (message: string, context?: LogContext) => void;
    error: (message: string, context?: LogContext) => void;
}
/**
 * Create a structured logger for a service
 */
export declare function createLogger(service: string): Logger;
