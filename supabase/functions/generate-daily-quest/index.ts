// Generate daily quest — AI designs everything: title, 5 questions across difficulty
// tiers (ง่ายมาก → ยากมาก), min_level, max XP, max gold
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await supa.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Role gate: only teachers/admins may invoke AI quest generation
    const { data: roleRow } = await supa
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["teacher", "admin"])
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { topic, content } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    if (!content || typeof content !== "string") throw new Error("content required");
    // Cap input size to prevent abuse of AI credits
    if (content.length > 10000) {
      return new Response(JSON.stringify({ error: "content too long (max 10000 chars)" }), {
        status: 413,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (typeof topic === "string" && topic.length > 500) {
      return new Response(JSON.stringify({ error: "topic too long (max 500 chars)" }), {
        status: 413,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const system = `คุณคือ AI ช่วยครูออกแบบ Daily Quest จากเนื้อหาที่สอน — คุณต้องออกแบบทุกอย่างเอง:
- สร้างคำถามภาษาไทย 5 ข้อ จากเนื้อหานี้เท่านั้น ห้ามออกนอกเรื่อง
- ระดับความยากของแต่ละข้อ ต้องไล่ระดับ: ข้อ 1 ง่ายมาก, ข้อ 2 ง่าย, ข้อ 3 ปานกลาง, ข้อ 4 ยาก, ข้อ 5 ยากมาก
- ตั้งชื่อ Quest ให้น่าสนใจและสื่อถึงเนื้อหา
- กำหนด difficulty รวม (easy/normal/hard) ตามภาพรวมของเนื้อหา
- กำหนด min_level (เลเวลนักเรียนขั้นต่ำที่ควรปลดล็อก: 1-20 ตามความยากของหัวข้อ)
- กำหนด max_xp_reward (50-300 ตามความยาก) และ max_gold_reward (15-100)
- แต่ละข้อมี expected_answer ที่ชัดเจน, keywords สำหรับตรวจ, และ points (รวมต้องเท่ากับ 100, ข้อยากขึ้นได้คะแนนมากขึ้น)`;

    const userPrompt = `หัวข้อ: ${topic ?? "-"}\n\nเนื้อหา:\n${content}\n\nออกแบบ Daily Quest ที่เหมาะสมที่สุด`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "design_quest",
              description:
                "Design a complete daily quest with auto-tuned difficulty, level, and rewards",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  difficulty: { type: "string", enum: ["easy", "normal", "hard"] },
                  min_level: {
                    type: "number",
                    description: "Minimum student level to unlock (1-20)",
                  },
                  max_xp_reward: {
                    type: "number",
                    description: "Max XP awarded for perfect score (50-300)",
                  },
                  max_gold_reward: {
                    type: "number",
                    description: "Max gold awarded for perfect score (15-100)",
                  },
                  questions: {
                    type: "array",
                    description:
                      "Exactly 5 questions in order: very easy, easy, medium, hard, very hard",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        difficulty_label: {
                          type: "string",
                          enum: ["ง่ายมาก", "ง่าย", "ปานกลาง", "ยาก", "ยากมาก"],
                        },
                        expected_answer: { type: "string" },
                        keywords: { type: "array", items: { type: "string" } },
                        points: { type: "number" },
                      },
                      required: [
                        "question",
                        "difficulty_label",
                        "expected_answer",
                        "keywords",
                        "points",
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: [
                  "title",
                  "difficulty",
                  "min_level",
                  "max_xp_reward",
                  "max_gold_reward",
                  "questions",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "design_quest" } },
      }),
    });
    if (res.status === 429)
      return new Response(JSON.stringify({ error: "rate_limit" }), {
        status: 429,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    if (res.status === 402)
      return new Response(JSON.stringify({ error: "credits" }), {
        status: 402,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    if (!res.ok)
      return new Response(JSON.stringify({ error: await res.text() }), {
        status: res.status,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    const j = await res.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args
      ? JSON.parse(args)
      : {
          title: topic ?? "Quest",
          questions: [],
          difficulty: "normal",
          min_level: 1,
          max_xp_reward: 100,
          max_gold_reward: 30,
        };
    return new Response(JSON.stringify(parsed), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
