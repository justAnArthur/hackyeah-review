import { loadCouncil } from "./council"
import type { Db } from "./db"
import type { Shot } from "./evidence"
import { type ContentPart, chat } from "./models"

// the caller supplies the prompt, since only it knows what the images show
export async function describeImages(db: Db, images: Shot[], prompt: string) {
  const { vision } = await loadCouncil()
  if (!vision) return ""
  const content: ContentPart[] = [
    { type: "text", text: `${prompt}\n\n${images.map((s, i) => `Image ${i + 1}: ${s.path}`).join("\n")}` },
    ...images.map(s => ({ type: "image_url" as const, image_url: { url: `data:${s.mime};base64,${Buffer.from(s.data).toString("base64")}` } })),
  ]
  return chat(db, vision, [{ role: "user", content }], { temperature: 0.2, max_tokens: 3000 })
}
