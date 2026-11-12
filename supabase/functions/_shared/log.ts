/**
 * The log line of an Edge Function: `[function-name] message detail`, on
 * stderr so it lands in the function's logs (Supabase dashboard › Edge
 * Functions › Logs). One place to change when logs become structured or are
 * forwarded to a monitoring service.
 */
export type Log = (message: string, detail?: unknown) => void;

export function functionLogger(name: string): Log {
  return (message, detail) => console.error(`[${name}] ${message}`, detail ?? "");
}
