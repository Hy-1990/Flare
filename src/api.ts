export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const r = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let d;
  try {
    d = await r.json();
  } catch {
    throw Error("无法读取本地服务的响应");
  }
  if (!r.ok) throw Error(d.error || "操作未完成");
  return d;
}
export const send = (method: string, body?: unknown) => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
