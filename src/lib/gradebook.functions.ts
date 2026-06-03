import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DbClient = SupabaseClient<Database>;
type ClassroomOwnerRow = Pick<
  Database["public"]["Tables"]["classrooms"]["Row"],
  "id" | "name" | "owner_id"
>;
type MemberRow = Pick<Database["public"]["Tables"]["classroom_members"]["Row"], "user_id">;
type AssignmentExportRow = Pick<
  Database["public"]["Tables"]["assignments"]["Row"],
  "id" | "title" | "max_score" | "due_date" | "late_penalty_percent"
>;
type ProfileNameRow = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "display_name">;
type SubmissionExportRow = Pick<
  Database["public"]["Tables"]["submissions"]["Row"],
  "assignment_id" | "user_id" | "score" | "is_late"
>;
type AttendanceSessionExportRow = Pick<
  Database["public"]["Tables"]["attendance_sessions"]["Row"],
  "id" | "title" | "session_date"
>;
type AttendanceRecordExportRow = Pick<
  Database["public"]["Tables"]["attendance_records"]["Row"],
  "session_id" | "user_id" | "status"
>;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  // Prepend BOM so Excel reads UTF-8 (Thai) correctly
  return "\uFEFF" + rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

async function assertClassroomOwner(supabase: DbClient, classroomId: string, userId: string) {
  const { data: cls, error } = await supabase
    .from("classrooms")
    .select("id, name, owner_id")
    .eq("id", classroomId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!cls) throw new Error("ไม่พบห้องเรียน");
  if (cls.owner_id !== userId) {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("เฉพาะเจ้าของห้องหรือ admin เท่านั้น");
  }
  return cls as ClassroomOwnerRow;
}

export const exportGradebook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { classroomId: string }) =>
    z.object({ classroomId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cls = await assertClassroomOwner(supabase, data.classroomId, userId);

    const [{ data: members }, { data: assignments }] = await Promise.all([
      supabase.from("classroom_members").select("user_id").eq("classroom_id", data.classroomId),
      supabase
        .from("assignments")
        .select("id, title, max_score, due_date, late_penalty_percent")
        .eq("classroom_id", data.classroomId)
        .order("created_at", { ascending: true }),
    ]);

    const memberRows = (members ?? []) as MemberRow[];
    const memberIds = memberRows.map((m) => m.user_id);
    const assignmentList = (assignments ?? []) as AssignmentExportRow[];

    const [{ data: profiles }, { data: submissions }] = await Promise.all([
      memberIds.length
        ? supabase.from("profiles").select("id, display_name").in("id", memberIds)
        : Promise.resolve({ data: [] as ProfileNameRow[] }),
      assignmentList.length
        ? supabase
            .from("submissions")
            .select("assignment_id, user_id, score, is_late")
            .in(
              "assignment_id",
              assignmentList.map((a) => a.id),
            )
        : Promise.resolve({ data: [] as SubmissionExportRow[] }),
    ]);

    const nameById = new Map<string, string>(
      ((profiles ?? []) as ProfileNameRow[]).map((p) => [p.id, p.display_name ?? p.id.slice(0, 8)]),
    );
    const subByKey = new Map<string, { score: number | null; is_late: boolean }>();
    for (const s of submissions ?? []) {
      subByKey.set(`${s.assignment_id}:${s.user_id}`, {
        score: s.score,
        is_late: !!s.is_late,
      });
    }

    const header: (string | number)[] = ["ชื่อนักเรียน", "user_id"];
    for (const a of assignmentList) header.push(`${a.title} (/${a.max_score})`);
    header.push("รวม", "เต็ม", "ร้อยละ");

    const rows: (string | number | null | undefined)[][] = [header];
    for (const uid of memberIds) {
      const row: (string | number | null | undefined)[] = [nameById.get(uid) ?? "", uid];
      let total = 0;
      let max = 0;
      for (const a of assignmentList) {
        const s = subByKey.get(`${a.id}:${uid}`);
        max += a.max_score ?? 0;
        if (!s || s.score === null || s.score === undefined) {
          row.push("");
        } else {
          let score = s.score;
          if (s.is_late && a.late_penalty_percent > 0) {
            score = Math.max(0, Math.round(score * (1 - a.late_penalty_percent / 100)));
          }
          total += score;
          row.push(score);
        }
      }
      row.push(total, max, max > 0 ? Math.round((total / max) * 10000) / 100 : 0);
      rows.push(row);
    }

    return {
      filename: `gradebook_${cls.name.replace(/[^a-zA-Z0-9ก-๙]/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`,
      csv: toCsv(rows),
    };
  });

export const exportAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { classroomId: string }) =>
    z.object({ classroomId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cls = await assertClassroomOwner(supabase, data.classroomId, userId);

    const [{ data: members }, { data: sessions }] = await Promise.all([
      supabase.from("classroom_members").select("user_id").eq("classroom_id", data.classroomId),
      supabase
        .from("attendance_sessions")
        .select("id, title, session_date")
        .eq("classroom_id", data.classroomId)
        .order("session_date", { ascending: true }),
    ]);

    const memberRows = (members ?? []) as MemberRow[];
    const memberIds = memberRows.map((m) => m.user_id);
    const sessionList = (sessions ?? []) as AttendanceSessionExportRow[];

    const [{ data: profiles }, { data: records }] = await Promise.all([
      memberIds.length
        ? supabase.from("profiles").select("id, display_name").in("id", memberIds)
        : Promise.resolve({ data: [] as ProfileNameRow[] }),
      sessionList.length
        ? supabase
            .from("attendance_records")
            .select("session_id, user_id, status")
            .in(
              "session_id",
              sessionList.map((s) => s.id),
            )
        : Promise.resolve({ data: [] as AttendanceRecordExportRow[] }),
    ]);

    const nameById = new Map<string, string>(
      ((profiles ?? []) as ProfileNameRow[]).map((p) => [p.id, p.display_name ?? p.id.slice(0, 8)]),
    );
    const recByKey = new Map<string, string>();
    for (const r of records ?? []) recByKey.set(`${r.session_id}:${r.user_id}`, r.status);

    const statusTh: Record<string, string> = {
      present: "มา",
      absent: "ขาด",
      late: "สาย",
      excused: "ลา",
    };

    const header: (string | number)[] = ["ชื่อนักเรียน", "user_id"];
    for (const s of sessionList) header.push(`${s.session_date} ${s.title}`);
    header.push("มา", "สาย", "ลา", "ขาด", "ร้อยละการเข้า");

    const rows: (string | number | null | undefined)[][] = [header];
    for (const uid of memberIds) {
      const row: (string | number | null | undefined)[] = [nameById.get(uid) ?? "", uid];
      let present = 0,
        late = 0,
        excused = 0,
        absent = 0;
      for (const s of sessionList) {
        const st = recByKey.get(`${s.id}:${uid}`) ?? "absent";
        row.push(statusTh[st] ?? st);
        if (st === "present") present++;
        else if (st === "late") late++;
        else if (st === "excused") excused++;
        else absent++;
      }
      const total = sessionList.length;
      const attendedPct = total > 0 ? Math.round(((present + late) / total) * 10000) / 100 : 0;
      row.push(present, late, excused, absent, attendedPct);
      rows.push(row);
    }

    return {
      filename: `attendance_${cls.name.replace(/[^a-zA-Z0-9ก-๙]/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`,
      csv: toCsv(rows),
    };
  });
