export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error("[safeJson] parse failed:", err);
    return fallback;
  }
}

export function safeJsonStringify(value: unknown, fallback = ""): string {
  try {
    return JSON.stringify(value);
  } catch (err) {
    console.error("[safeJson] stringify failed:", err);
    return fallback;
  }
}

export function safeJsonStringifyPretty(value: unknown, fallback = ""): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    console.error("[safeJson] stringify failed:", err);
    return fallback;
  }
}

export async function safeResponseJson<T>(response: Response, fallback: T): Promise<T> {
  try {
    const text = await response.text();
    return safeJsonParse<T>(text, fallback);
  } catch (err) {
    console.error("[safeJson] response read failed:", err);
    return fallback;
  }
}
