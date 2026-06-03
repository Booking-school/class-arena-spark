// Personal AI tutor - scoped to lesson contents from student's classrooms
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type LessonContent = {
  topic: string | null;
  content: string | null;
  lesson_date: string | null;
  classroom_id: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { messages, classroom_id } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const supaKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supa = createClient(supaUrl, supaKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Require an authenticated user before forwarding to the AI gateway.
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

    // Fetch lesson contents from classrooms the user is in (RLS enforces)
    let q = supa
      .from("lesson_contents")
      .select("topic, content, lesson_date, classroom_id")
      .order("lesson_date", { ascending: false })
      .limit(20);
    if (classroom_id) q = q.eq("classroom_id", classroom_id);
    const { data: lessons } = await q;

    const scope = ((lessons ?? []) as LessonContent[])
      .map((l) => `[${l.lesson_date}] ${l.topic}\n${l.content}`)
      .join("\n\n---\n\n");

    const system = `คุณคือ Scholar Tutor ครูส่วนตัวของนักเรียน
**กฎสำคัญ:**
- ตอบคำถามได้เฉพาะหัวข้อที่อยู่ใน "เนื้อหาที่ครูสอน" ด้านล่างเท่านั้น
- คุณสามารถอธิบายเพิ่ม ยกตัวอย่าง ถามกลับ หรือสร้างโจทย์ฝึกในขอบเขตเดียวกันได้
- ถ้านักเรียนถามเรื่องนอกขอบเขต ให้บอกสุภาพว่า "ครูยังไม่ได้สอนเรื่องนี้ ลองถามอาจารย์หรือรอบทเรียนถัดไปนะ"
- ตอบเป็นภาษาไทย กระชับ เป็นมิตร เหมาะกับเด็ก
- ไม่เฉลยคำตอบของ Quest โดยตรง แต่ช่วยอธิบายแนวคิด

**เนื้อหาที่ครูสอน:**
${scope || "(ยังไม่มีบทเรียน — แจ้งนักเรียนว่ายังไม่มีเนื้อหาให้สอบถาม)"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, ...(messages ?? [])],
        stream: true,
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
    return new Response(res.body, {
      headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
