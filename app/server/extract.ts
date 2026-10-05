import { extname } from "node:path"
import { decode } from "../../scripts/lib"

function tidy(text: string) {
  return text
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function meta(html: string, name: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!new RegExp(`(name|property)=["']${name}["']`, "i").test(tag)) continue
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1]
    if (content) return tidy(decode(content))
  }
  return ""
}

// static html only: a page rendered entirely by javascript yields little more than its title
export function htmlText(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""
  const body = html
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>|<\/(p|div|section|article|main|header|footer|nav|li|tr|h[1-6]|button|a)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  return {
    title: tidy(decode(title)),
    description: meta(html, "description") || meta(html, "og:description"),
    text: tidy(decode(body)).replace(/\n{2,}/g, "\n"),
  }
}

// text runs of a pptx slide (<a:t>) or a docx body (<w:t>), one line per paragraph
export function officeXmlText(xml: string) {
  return tidy(decode(xml.replace(/<\/(a|w):p>/g, "\n").replace(/<(a|w):(tab|br)\b[^>]*\/>/g, " ").replace(/<[^>]+>/g, "")))
}

function run(cmd: string[]) {
  const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "ignore" })
  return p.exitCode === 0 ? p.stdout.toString() : null
}

function pptxText(path: string) {
  const list = run(["unzip", "-Z1", path])
  if (list === null) return null
  const slides = list
    .split("\n")
    .map(name => ({ name, n: Number(name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]) }))
    .filter(s => s.n)
    .sort((a, b) => a.n - b.n)
  const parts = slides.map(s => {
    const text = officeXmlText(run(["unzip", "-p", path, s.name]) ?? "")
    return text ? `Slide ${s.n}\n${text}` : ""
  })
  return parts.filter(Boolean).join("\n\n")
}

export function documentText(path: string, pages = 15) {
  const ext = extname(path).toLowerCase()
  if (ext === ".pdf") {
    const text = run(["pdftotext", "-l", String(pages), "-layout", path, "-"])
    return text === null ? null : tidy(text)
  }

  if (ext === ".pptx") return pptxText(path)

  if (ext === ".docx") {
    const xml = run(["unzip", "-p", path, "word/document.xml"])
    return xml === null ? null : officeXmlText(xml)
  }
  return null
}
