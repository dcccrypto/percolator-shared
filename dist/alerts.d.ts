type AlertSeverity = "critical" | "warning" | "info";
/**
 * Send an alert to Discord via webhook
 * @param message - Alert message
 * @param severity - Alert severity level
 * @param fields - Additional structured fields
 */
export declare function sendAlert(message: string, severity: AlertSeverity, fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
}>): Promise<void>;
/**
 * Send a critical alert
 */
export declare function sendCriticalAlert(message: string, fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
}>): Promise<void>;
/**
 * Send a warning alert
 */
export declare function sendWarningAlert(message: string, fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
}>): Promise<void>;
/**
 * Send an info alert
 */
export declare function sendInfoAlert(message: string, fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
}>): Promise<void>;
export {};
