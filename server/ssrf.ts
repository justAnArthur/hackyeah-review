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

// demo links come from user input, so every hop is re-checked before it is fetched
export async function checkUrl(url: string, hops = 3): Promise<string> {
  if (!(await isPublicHttps(url))) return "skipped (not a public https URL)"
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) })
    const location = res.headers.get("location")
    if (res.status >= 300 && res.status < 400 && location && hops > 0) {
      return checkUrl(new URL(location, url).toString(), hops - 1)
    }
    await res.body?.cancel()
    return `HTTP ${res.status}`
  } catch (e) {
    return `no response (${(e as Error).name === "TimeoutError" ? "timeout" : "error"})`
  }
}
