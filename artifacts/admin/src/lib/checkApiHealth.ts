export async function checkApiHealth(): Promise<{ reachable: boolean; url: string }> {
  const url = "/api/health";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return { reachable: res.ok, url };
  } catch {
    return { reachable: false, url };
  } finally {
    clearTimeout(timer);
  }
}
