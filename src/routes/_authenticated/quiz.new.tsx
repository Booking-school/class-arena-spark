import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Sparkles } from "lucide-react";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/quiz/new")({
  validateSearch: (s: Record<string, unknown>) => ({ classroom: (s.classroom as string) ?? "" }),
  component: NewQuizPage,
});

type DraftQ = {
  question: string;
  options: string[];
  correct_idx: number;
  time_limit_seconds: number;
  points: number;
};

type GeneratedQuizQuestion = {
  question?: string;
  options?: unknown;
  correct_idx?: unknown;
};

type GeneratedQuizResponse = {
  questions?: GeneratedQuizQuestion[];
};

function getErrorMessage(error: unknown, fallback = tr("เกิดข้อผิดพลาด")) {
  return error instanceof Error ? error.message : fallback;
}

function emptyQ(): DraftQ {
  return {
    question: "",
    options: ["", "", "", ""],
    correct_idx: 0,
    time_limit_seconds: 20,
    points: 1000,
  };
}

function NewQuizPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { classroom } = Route.useSearch();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [questions, setQuestions] = useState<DraftQ[]>([emptyQ()]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  function update(i: number, patch: Partial<DraftQ>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function updateOption(i: number, oi: number, v: string) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === i ? { ...q, options: q.options.map((o, j) => (j === oi ? v : o)) } : q,
      ),
    );
  }

  async function generateWithAI() {
    if (!topic.trim()) {
      toast.error(tr("กรอกหัวข้อก่อน"));
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-quest", {
        body: { topic, count: 5, multiple_choice: true },
      });
      if (error) throw error;
      const gen = (data as GeneratedQuizResponse | null)?.questions;
      if (Array.isArray(gen) && gen.length) {
        const mapped: DraftQ[] = gen.slice(0, 10).map((g) => ({
          question: g.question ?? "",
          options:
            Array.isArray(g.options) && g.options.length >= 2
              ? g.options.slice(0, 4).concat(Array(4).fill("")).slice(0, 4)
              : ["", "", "", ""],
          correct_idx: typeof g.correct_idx === "number" ? g.correct_idx : 0,
          time_limit_seconds: 20,
          points: 1000,
        }));
        setQuestions(mapped);
        if (!title) setTitle(topic);
        toast.success(`สร้าง ${mapped.length} ข้อแล้ว ตรวจทานก่อนบันทึก`);
      } else {
        toast.error(tr("AI ไม่คืนคำถามที่ใช้ได้ ลองอีกครั้ง"));
      }
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, tr("AI ล้มเหลว")));
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!classroom) {
      toast.error(tr("ไม่พบห้องเรียน"));
      return;
    }
    if (!title.trim()) {
      toast.error(tr("ใส่ชื่อควิซ"));
      return;
    }
    const valid = questions.filter(
      (q) => q.question.trim() && q.options.filter((o) => o.trim()).length >= 2,
    );
    if (valid.length === 0) {
      toast.error(tr("ต้องมีคำถามอย่างน้อย 1 ข้อ (มีตัวเลือก ≥2)"));
      return;
    }
    setSaving(true);
    try {
      const { data: s, error } = await supabase
        .from("quiz_sessions")
        .insert({
          classroom_id: classroom,
          host_id: user!.id,
          title,
        })
        .select()
        .single();
      if (error) throw error;
      const rows = valid.map((q, i) => ({
        session_id: s.id,
        idx: i,
        question: q.question,
        options: q.options.filter((o) => o.trim()),
        correct_idx: Math.min(q.correct_idx, q.options.filter((o) => o.trim()).length - 1),
        time_limit_seconds: q.time_limit_seconds,
        points: q.points,
      }));
      const { error: e2 } = await supabase.from("quiz_questions").insert(rows);
      if (e2) throw e2;
      toast.success(tr("สร้างควิซแล้ว"));
      nav({ to: "/quiz/$sessionId", params: { sessionId: s.id } });
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-10 space-y-6">
      <header>
        <h1 className="font-display text-3xl">{tr("สร้าง Live Quiz")}</h1>
        <p className="text-muted-foreground mt-1">
          {tr("นักเรียนเข้าร่วมด้วยรหัส 6 หลัก ตอบเร็วได้คะแนนเยอะ")}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr("ข้อมูลควิซ")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>{tr("ชื่อควิซ")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr("เช่น ทบทวนบทที่ 3")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tr("สร้างจาก AI (ไม่บังคับ)")}</Label>
            <div className="flex gap-2">
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={tr("หัวข้อ เช่น สมการกำลังสอง")}
              />
              <Button
                type="button"
                variant="outline"
                onClick={generateWithAI}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                AI สร้าง 5 ข้อ
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">ข้อ {i + 1}</CardTitle>
              {questions.length > 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                rows={2}
                value={q.question}
                placeholder={tr("คำถาม")}
                onChange={(e) => update(i, { question: e.target.value })}
              />
              <div className="grid sm:grid-cols-2 gap-2">
                {q.options.map((opt, oi) => (
                  <label
                    key={oi}
                    className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer ${q.correct_idx === oi ? "border-green-500 bg-green-50" : "border-input"}`}
                  >
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      checked={q.correct_idx === oi}
                      onChange={() => update(i, { correct_idx: oi })}
                    />
                    <Input
                      value={opt}
                      onChange={(e) => updateOption(i, oi, e.target.value)}
                      placeholder={`ตัวเลือก ${oi + 1}`}
                      className="flex-1 border-0 shadow-none focus-visible:ring-0 p-0 h-6"
                    />
                  </label>
                ))}
              </div>
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-2">
                  เวลา (วิ)
                  <Input
                    type="number"
                    min={5}
                    max={120}
                    value={q.time_limit_seconds}
                    onChange={(e) => update(i, { time_limit_seconds: +e.target.value || 20 })}
                    className="w-20"
                  />
                </label>
                <label className="flex items-center gap-2">
                  คะแนน
                  <Input
                    type="number"
                    min={100}
                    max={2000}
                    step={100}
                    value={q.points}
                    onChange={(e) => update(i, { points: +e.target.value || 1000 })}
                    className="w-24"
                  />
                </label>
              </div>
            </CardContent>
          </Card>
        ))}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setQuestions((qs) => [...qs, emptyQ()])}
        >
          <Plus className="size-4 mr-1" />
          เพิ่มคำถาม
        </Button>
      </div>

      <div className="sticky bottom-4 flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => nav({ to: "/classrooms/$id", params: { id: classroom } })}
        >
          {tr("ยกเลิก")}
        </Button>
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}บันทึก & ไปที่ห้องรอ
        </Button>
      </div>
    </div>
  );
}
