// AI grades student answers to a quest
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type QuestQuestion = {
  question: string;
  expected_answer?: string;
  keywords?: string[];
  points?: number;
};

type GradeResult = {
  idx: number;
  score: number;
  max_score: number;
  correct: boolean;
  feedback: string;
};

type GradeResponse = {
  results: GradeResult[];
  overall_feedback: string;
};

type AiResponse = {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function?: { arguments?: string };
      }>;
    };
  }>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    // Require authentication — handler returns answer-key-derived feedback
    // and must not be callable anonymously.
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

    const body = await req.json();
    const { quest_id, answers, only_index } = body;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    if (!quest_id || !Array.isArray(answers)) throw new Error("invalid input");

    // Fetch authoritative questions (with answer keys) server-side using service role
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const qRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_quest_for_grading`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ _quest_id: quest_id }),
    });
    if (!qRes.ok) throw new Error(`fetch quest failed: ${qRes.status}`);
    const questionPayload = (await qRes.json()) as unknown;
    if (!Array.isArray(questionPayload)) throw new Error("quest not found");
    const allQuestions = questionPayload as QuestQuestion[];

    // If only_index is given, grade just that one question (keep idx aligned with full list)
    const targetIndices: number[] =
      typeof only_index === "number" ? [only_index] : allQuestions.map((_, i) => i);

    const system = `คุณคือ AI ครูใจดีที่ตรวจคำตอบนักเรียนภาษาไทยอย่างยุติธรรมและให้คะแนนแบบ "บางส่วน" (partial credit)

หลักการให้คะแนน (สำคัญมาก):
- อย่าให้ 0 ถ้าคำตอบมีความเกี่ยวข้องบ้าง ให้คะแนนตามระดับความใกล้เคียง/ความเข้าใจ
- ตรง 100% = เต็ม / ใกล้เคียงมาก = 80-90% / เข้าใจหลักแต่ไม่ครบ = 50-70% / เกี่ยวข้องเล็กน้อย = 20-40% / ไม่เกี่ยวเลย/ว่างเปล่า = 0
- ยอมรับคำพ้องความหมาย คำใกล้เคียง การสะกดผิดเล็กน้อย และคำตอบที่กว้างกว่าหรือแคบกว่าเฉลย
- เช่น ถ้าเฉลยคือ "โปรแกรมออกแบบกราฟิก" คำตอบ "โปรแกรมทำภาพ" / "โปรแกรมนำเสนอ" / "ใช้ทำโปสเตอร์" ควรได้คะแนนบางส่วน ไม่ใช่ 0
- คะแนน (score) ต้องเป็นจำนวนเต็ม 0 ถึง max_points
- correct = true เฉพาะเมื่อ score >= 80% ของ max_points
- feedback สั้น เป็นกำลังใจ บอกสิ่งที่ดี + สิ่งที่เติมได้`;

    const payload = allQuestions
      .filter((_, i) => targetIndices.includes(i))
      .map((q) => {
        const i = allQuestions.indexOf(q);
        return {
          idx: i,
          question: q.question,
          expected: q.expected_answer,
          keywords: q.keywords ?? [],
          max_points: q.points ?? Math.floor(100 / allQuestions.length),
          student_answer: answers[i] ?? "",
        };
      });

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `ตรวจคำตอบ:\n${JSON.stringify(payload, null, 2)}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "grade",
              description: "Submit grading results",
              parameters: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        idx: { type: "number" },
                        score: { type: "number" },
                        max_score: { type: "number" },
                        correct: { type: "boolean" },
                        feedback: { type: "string" },
                      },
                      required: ["idx", "score", "max_score", "correct", "feedback"],
                      additionalProperties: false,
                    },
                  },
                  overall_feedback: { type: "string" },
                },
                required: ["results", "overall_feedback"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "grade" } },
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
    const j = (await res.json()) as AiResponse;
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = (
      args ? JSON.parse(args) : { results: [], overall_feedback: "" }
    ) as GradeResponse;
    const total = parsed.results.reduce((s, r) => s + (r.score ?? 0), 0);
    const max = parsed.results.reduce((s, r) => s + (r.max_score ?? 0), 0);

    // Persist authoritative per-question results server-side using the service
    // role. A DB trigger blocks clients from writing `result` directly, so this
    // is the only trusted path that sets the score the reward functions read.
    try {
      const rows = parsed.results
        .filter((r) => typeof r.idx === "number")
        .map((r) => ({
          user_id: user.id,
          quest_id,
          q_index: r.idx,
          answer: answers[r.idx] ?? "",
          result: r as unknown,
        }));
      if (rows.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/daily_quest_question_progress`, {
          method: "POST",
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(rows),
        });
      }
    } catch (_persistErr) {
      // Non-fatal: client also upserts the answer, and finalize re-reads
      // server progress. Avoid leaking internals to the client.
    }

    return new Response(JSON.stringify({ ...parsed, total_score: total, max_score: max }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
