export function isMissingSupabaseTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const typed = error as {
    status?: number;
    code?: string;
    message?: string;
  };

  const message = typed.message?.toLowerCase() ?? "";
  return (
    typed.status === 404 ||
    typed.code === "PGRST116" ||
    typed.code === "PGRST301" ||
    typed.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("schema cache") ||
    message.includes("not found")
  );
}

export function isSupabaseWriteAccessError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const typed = error as {
    status?: number;
    code?: string;
    message?: string;
  };

  const message = typed.message?.toLowerCase() ?? "";
  return (
    typed.status === 401 ||
    typed.status === 403 ||
    typed.code === "42501" ||
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("not allowed")
  );
}

export function isSupabaseAuthRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const typed = error as {
    status?: number;
    code?: string;
    message?: string;
  };

  const message = typed.message?.toLowerCase() ?? "";
  return (
    typed.status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("email rate limit exceeded")
  );
}