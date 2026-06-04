import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STUDENT_EMAIL_DOMAIN = "student.scholarhall.local";

const InputSchema = z.object({
  studentId: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9._-]+$/, "invalid id"),
  password: z.string().min(6).max(128),
  displayName: z.string().min(1).max(120),
});

// Per-IP rate limit: at most N signup attempts per hour from a single IP.
// Prevents abuse of the public createStudentAccount endpoint which uses the
// service role to create users (bypassing Supabase's per-project signup quotas).
const MAX_SIGNUPS_PER_IP_PER_HOUR = 200;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "error";
}

function getClientIp(): string {
  try {
    const req = getRequest();
    const h = req.headers;
    return (
      h.get("cf-connecting-ip") ||
      h.get("x-real-ip") ||
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

async function enforceSignupRateLimit(ip: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await supabaseAdmin
    .from("signup_rate_limit")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", sinceIso);
  if (countErr) throw new Error("rate limit check failed");
  if ((count ?? 0) >= MAX_SIGNUPS_PER_IP_PER_HOUR) {
    throw new Error("มีการสมัครจาก IP นี้มากเกินไป กรุณาลองใหม่ภายหลัง");
  }
  await supabaseAdmin.from("signup_rate_limit").insert({ ip });
}

async function createOne(
  input: z.infer<typeof InputSchema>,
  opts: { allowReset?: boolean } = {},
): Promise<{ userId?: string; reset?: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = `${input.studentId}@${STUDENT_EMAIL_DOMAIN}`;
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      display_name: input.displayName,
      role: "student",
      student_id: input.studentId,
    },
  });
  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    const isDup = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
    if (isDup) {
      if (!opts.allowReset) throw new Error("ID นี้ถูกใช้แล้ว");
      // Idempotent (admin/bulk) path: reset password for existing student
      // so the teacher can re-issue credentials without manual recovery.
      let existingId: string | undefined;
      for (let page = 1; page <= 20 && !existingId; page++) {
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (listErr) throw new Error(listErr.message);
        const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (found) existingId = found.id;
        if (list.users.length < 200) break;
      }
      if (!existingId) throw new Error("ID นี้ถูกใช้แล้ว แต่หา user ไม่เจอ");
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existingId, {
        password: input.password,
        email_confirm: true,
      });
      if (updErr) throw new Error(updErr.message);
      await supabaseAdmin
        .from("student_passwords")
        .upsert(
          { user_id: existingId, password: input.password, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      return { userId: existingId, reset: true };
    }
    throw new Error(error.message || "สร้างบัญชีไม่สำเร็จ");
  }
  const userId = created.user?.id;
  if (userId) {
    await supabaseAdmin
      .from("student_passwords")
      .upsert(
        { user_id: userId, password: input.password, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  }
  return { userId };
}

export const createStudentAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    // Public endpoint (used by student self-signup form). Apply per-IP
    // rate limit to prevent abuse of the service-role admin createUser call.
    const ip = getClientIp();
    await enforceSignupRateLimit(ip);
    const result = await createOne(data);
    return { ok: true, userId: result.userId };
  });

const BulkSchema = z.object({
  students: z.array(InputSchema).min(1).max(200),
});

export const bulkCreateStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => BulkSchema.parse(data))
  .handler(async ({ data, context }) => {
    // admin check
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("เฉพาะ admin เท่านั้น");

    const results: { studentId: string; ok: boolean; reset?: boolean; error?: string }[] = [];
    for (const s of data.students) {
      try {
        const r = await createOne(s, { allowReset: true });
        results.push({ studentId: s.studentId, ok: true, reset: r.reset });
      } catch (e: unknown) {
        results.push({ studentId: s.studentId, ok: false, error: getErrorMessage(e) });
      }
    }
    return { results };
  });
