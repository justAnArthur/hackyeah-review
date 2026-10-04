// stand-in for OpenRouter's chat endpoint, for local end-to-end runs without a key:
// OPENROUTER_BASE_URL=http://localhost:4790 OPENROUTER_API_KEY=mock bun server/index.ts
const PORT = Number(process.env.MOCK_PORT ?? 4790)
const FLAKY = process.env.MOCK_FLAKY === "1"
let calls = 0

function criteria(system: string) {
  const block = system.split("### Criteria and weights")[1]?.split("###")[0] ?? ""
  return [...block.matchAll(/^- (.+): \d+$/gm)].map(m => m[1])
}

function memberReply(model: string, names: string[]) {
  const base = 5 + (model.length % 4)
  return {
    task_fit: "yes",
    scores: names.map((criterion, i) => ({ criterion, score: Math.min(10, base + (i % 3) * 0.5), why: `Mock reasoning from ${model} about ${criterion}.` })),
    build_reality: base,
    strengths: [`Mock strength from ${model}`],
    weaknesses: ["Mock weakness"],
    red_flags: [],
    verdict: `Mock verdict from ${model}.`,
  }
}

function judgeReply(prompt: string) {
  const names = [...prompt.matchAll(/^- (.+) \(weight \d+\): /gm)].map(m => m[1])
  const letters = [...prompt.matchAll(/^### Member ([A-H])$/gm)].map(m => m[1])
  return {
    task_fit: "yes",
    criteria: names.map(criterion => ({ criterion, why: `The council agrees on ${criterion}.` })),
    strengths: ["Consolidated strength"],
    weaknesses: ["Consolidated weakness"],
    red_flags: [],
    verdict: "Consolidated mock verdict.",
    agreement: Object.fromEntries(letters.map((l, i) => [l, 0.9 - i * 0.1])),
  }
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname !== "/chat/completions") return new Response("not found", { status: 404 })
    calls++
    if (FLAKY && calls === 2) return new Response("busy", { status: 429, headers: { "retry-after": "2" } })
    const body = (await req.json()) as { model: string; messages: { role: string; content: string }[] }
    const system = body.messages.find(m => m.role === "system")?.content ?? ""
    const user = body.messages.find(m => m.role === "user")?.content ?? ""
    const reply = system ? memberReply(body.model, criteria(system)) : judgeReply(user)
    await Bun.sleep(150)
    return Response.json({ choices: [{ message: { role: "assistant", content: "```json\n" + JSON.stringify(reply) + "\n```" } }] })
  },
})
console.log(`mock OpenRouter on http://localhost:${PORT}`)
