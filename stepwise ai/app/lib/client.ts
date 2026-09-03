// Client-side API helper — unwraps the standard { data, error } envelope.
export interface ApiError {
  code: string;
  message: string;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin"
  });
  let payload: { data?: T; error?: ApiError | null };
  try {
    payload = await res.json();
  } catch {
    throw new Error("The server didn't respond correctly. Please try again.");
  }
  if (!res.ok || payload.error) {
    throw new Error(payload.error?.message ?? "Something went wrong. Please try again.");
  }
  return payload.data as T;
}
