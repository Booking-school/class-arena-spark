import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { bulkCreateStudents } from "@/lib/student-signup.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/students")({
  component: AdminStudentsPage,
});

function sanitize(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
}

function AdminStudentsPage() {
  const { roles } = useAuth();
  const [raw, setRaw] = useState("");
  const [defaultPw, setDefaultPw] = useState("student123");
  const [results, setResults] = useState<
    { studentId: string; ok: boolean; reset?: boolean; error?: string }[]
  >([]);

  const fn = useServerFn(bulkCreateStudents);
  const m = useMutation({
    mutationFn: async (students: { studentId: string; password: string; displayName: string }[]) =>
      fn({ data: { students } }),
    onSuccess: (data) => {
      setResults(data.results);
      const ok = data.results.filter((r) => r.ok).length;
      const reset = data.results.filter((r) => r.reset).length;
      toast.success(
        `สำเร็จ ${ok}/${data.results.length} บัญชี${reset ? ` (รีเซ็ตรหัสผ่าน ${reset} บัญชี)` : ""}`,
      );
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });

  if (!roles.includes("admin")) {
    return <div className="p-8 text-muted-foreground">เฉพาะ admin เท่านั้น</div>;
  }

  function parseRows() {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const out: { studentId: string; password: string; displayName: string }[] = [];
    const errors: string[] = [];
    for (const [i, line] of lines.entries()) {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      const id = sanitize(parts[0] ?? "");
      const name = parts[1] ?? id;
      const pw = parts[2] || defaultPw;
      if (id.length < 3) {
        errors.push(`บรรทัด ${i + 1}: ID สั้นไป (${parts[0]})`);
        continue;
      }
      if (pw.length < 6) {
        errors.push(`บรรทัด ${i + 1}: รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร`);
        continue;
      }
      out.push({ studentId: id, password: pw, displayName: name });
    }
    return { out, errors };
  }

  function handleSubmit() {
    const { out, errors } = parseRows();
    if (errors.length) {
      toast.error(errors.join("\n"));
      return;
    }
    if (!out.length) {
      toast.error("กรุณากรอกรายชื่อ");
      return;
    }
    setResults([]);
    m.mutate(out);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl">เพิ่ม / รีเซ็ตบัญชีนักเรียน (Bulk)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ใส่ทีละบรรทัด รูปแบบ: <code>ID, ชื่อ-นามสกุล, รหัสผ่าน</code> (รหัสผ่านไม่ใส่ก็ได้
          จะใช้ค่า default). ถ้า ID มีอยู่แล้ว ระบบจะ <b>รีเซ็ตรหัสผ่าน</b> ให้อัตโนมัติ
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>รายชื่อ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="default-student-password">
              รหัสผ่าน default (ใช้เมื่อไม่ระบุในบรรทัด)
            </Label>
            <Input
              id="default-student-password"
              value={defaultPw}
              onChange={(e) => setDefaultPw(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-student-list">รายชื่อนักเรียน (สูงสุด 200 คน/รอบ)</Label>
            <Textarea
              id="bulk-student-list"
              rows={12}
              placeholder={`somchai01, สมชาย ใจดี\nsompong02, สมพงษ์ ขยัน, mypass123\n253530, นักเรียน ก`}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <Button onClick={handleSubmit} disabled={m.isPending}>
            {m.isPending ? "กำลังสร้าง..." : "สร้างบัญชีทั้งหมด"}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>ผลลัพธ์</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm font-mono">
              {results.map((r) => (
                <div
                  key={r.studentId}
                  className={
                    r.ok ? (r.reset ? "text-amber-600" : "text-green-600") : "text-destructive"
                  }
                >
                  {r.ok ? (r.reset ? "↻" : "✓") : "✗"} {r.studentId}
                  {r.reset ? " รีเซ็ตรหัสผ่านแล้ว" : ""}
                  {r.error ? `: ${r.error}` : ""}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
