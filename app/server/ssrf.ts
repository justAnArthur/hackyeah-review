import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

function isPrivateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

export function isPrivateIp(ip: string) {
  if (isIP(ip) === 4) return isPrivateV4(ip)
  const v6 = ip.toLowerCase()
  if (v6.startsWith("::ffff:")) return isPrivateV4(v6.slice(7))
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb")
}

export async function isPublicHttps(url: string) {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== "https:" || u.username || u.password) return false
  if (isIP(u.hostname)) return !isPrivateIp(u.hostname)
  try {
    const addrs = await lookup(u.hostname, { all: true })
    return addrs.length > 0 && addrs.every(a => !isPrivateIp(a.address))
  } catch {
    return false
  }
}

const MAX_PAGE = 1024 * 1024

async function readCapped(res: Response, max: number) {
  const reader = res.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < max) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  await reader.cancel()
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, max))
}

// demo links come from user input, so every hop is re-checked before it is fetched
export async function fetchPage(url: string, hops = 3): Promise<{ url: string; status: string; html: string | null }> {
  if (!(await isPublicHttps(url))) return { url, status: "skipped (not a public https URL)", html: null }
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { accept: "text/html,*/*;q=0.5", "user-agent": "hackyeah-review (+https://hackyeah-review.justadomainname.dev)" },
    })
    const location = res.headers.get("location")
    if (res.status >= 300 && res.status < 400 && location && hops > 0) {
      await res.body?.cancel()
      return fetchPage(new URL(location, url).toString(), hops - 1)
    }
    const isHtml = res.ok && (res.headers.get("content-type") ?? "").includes("html")
    if (!isHtml) await res.body?.cancel()
    return { url, status: `HTTP ${res.status}`, html: isHtml ? await readCapped(res, MAX_PAGE) : null }
  } catch (e) {
    return { url, status: `no response (${(e as Error).name === "TimeoutError" ? "timeout" : "error"})`, html: null }
  }
}
