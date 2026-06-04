import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const STUDENT_EMAIL_DOMAIN = "student.scholarhall.local";

const InputSchema = z.object({
  identifier: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

function toEmail(raw: string) {
  const v = raw.trim();
  if (v.includes("@")) return v;
  return `${v.toLowerCase().replace(/[^a-z0-9._-]/g, "")}@${STUDENT_EMAIL_DOMAIN}`;
}

// Sign in server-side ด้วย anon client เพื่อหลบ per-IP rate-limit
// (โรงเรียนใช้ IP เดียว -> client-side login โดน 429 ได้ง่าย)
export const signInProxy = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL!;
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const email = toEmail(data.identifier);
    const password = data.password.trim();
    const { data: res, error } = await sb.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !res.session) {
      throw new Error("อีเมล/ID หรือรหัสผ่านไม่ถูกต้อง");
    }
    return {
      access_token: res.session.access_token,
      refresh_token: res.session.refresh_token,
    };
  });
