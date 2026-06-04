import { createFileRoute, Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";

import { tr } from "@/i18n";
function CheckInQR({ code }: { code: string }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    setUrl(`${window.location.origin}/checkin?code=${code}`);
  }, [code]);
  return (
    <div className="bg-white p-2 rounded-md border shrink-0">
      <QRCodeSVG value={url || code} size={88} />
    </div>
  );
}
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { exportGradebook, exportAttendance } from "@/lib/gradebook.functions";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { MediaPreview } from "@/components/media-preview";
import { toast } from "sonner";
import {
  Plus,
  FileText,
  Calendar,
  ClipboardList,
  Upload,
  ExternalLink,
  BookOpenCheck,
  Sparkles,
  Loader2,
  Trash2,
  Download,
  Megaphone,
  KeyRound,
  Timer,
  Pin,
  Trophy,
  Pencil,
} from "lucide-react";
import { AssignmentComments } from "@/components/assignment-comments";
import { QuestCard, StudentQuestQuestions } from "./quests";

export const Route = createFileRoute("/_authenticated/classrooms/$id")({
  component: ClassroomDetail,
});

type TableRow<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
type ViewRow<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];

type MaterialRow = TableRow<"materials">;
type LessonRow = TableRow<"lesson_contents">;
type AnnouncementRow = TableRow<"announcements"> & {
  profiles?: { display_name: string | null } | null;
};
type SubmissionRow = TableRow<"submissions"> & {
  profiles?: { display_name: string | null } | null;
};
type AttendanceSessionRow = ViewRow<"attendance_sessions_safe">;
type AttendanceRecordRow = TableRow<"attendance_records">;
type AttendanceMemberRow = {
  user_id: string;
  profiles?: { display_name: string | null } | null;
};
type DailyQuestRow = ViewRow<"daily_quests_safe">;
type ClassroomScoreRow = TableRow<"classroom_scores">;
type ClassroomMemberProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};
type AttendanceStatus = "present" | "late" | "excused" | "absent";
type DailyQuestQuestion = {
  question: string;
  expected_answer: string;
  points: number;
  difficulty_label?: string;
};
type DailyQuestPreview = {
  title: string;
  topic: string;
  lesson_id: string;
  questions: DailyQuestQuestion[];
  min_level?: number | null;
  max_xp_reward?: number | null;
  max_gold_reward?: number | null;
  difficulty?: string | null;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function ClassroomDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qcRoot = useQueryClient();
  const [tab, setTab] = useState("announcements");
  const [materialsFilter, setMaterialsFilter] = useState<string>("all");
  const [gradeOpen, setGradeOpen] = useState(false);
  const [gradeValue, setGradeValue] = useState("");
  const [gradeError, setGradeError] = useState<string | null>(null);

  const { data: classroom, isLoading } = useQuery({
    queryKey: ["classroom", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classrooms")
        .select("id, name, owner_id, subject, description, grade_level, created_at, updated_at")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: joinCode } = useQuery({
    queryKey: ["classroom-join-code", id],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_classroom_join_code", { _classroom_id: id });
      return (data as string | null) ?? null;
    },
    enabled: !!classroom && classroom.owner_id === user?.id,
  });

  const saveGrade = useMutation({
    mutationFn: async () => {
      const trimmed = gradeValue.trim();
      const { error } = await supabase
        .from("classrooms")
        .update({ grade_level: trimmed || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("บันทึกสายชั้นแล้ว"));
      setGradeOpen(false);
      setGradeError(null);
      qcRoot.invalidateQueries({ queryKey: ["classroom", id] });
      qcRoot.invalidateQueries({ queryKey: ["grade-leaderboard"] });
    },
    onError: (error: Error) => {
      setGradeError(error.message);
      toast.error(error.message);
    },
  });

  const isOwner = classroom?.owner_id === user?.id;

  if (isLoading) return <div className="p-10 text-muted-foreground">{tr("กำลังโหลด…")}</div>;
  if (!classroom) return <div className="p-10">{tr("ไม่พบห้องเรียน")}</div>;

  function openLessonDocs(lessonId: string) {
    setMaterialsFilter(lessonId);
    setTab("materials");
  }

  function openGradeDialog() {
    if (!classroom) return;
    setGradeValue(classroom.grade_level ?? "");
    setGradeError(null);
    setGradeOpen(true);
  }

  const gradeLevel = classroom.grade_level ?? null;

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10 space-y-6">
      <header className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <BookOpenCheck className="size-4" />
              {tr("ห้องเรียนที่เชื่อมบทเรียน งาน และเช็กชื่อ")}
            </div>
            <h1 className="text-4xl font-semibold">{classroom.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {classroom.subject && (
                <Badge variant="secondary" className="font-semibold">
                  {tr("วิชา")}: {classroom.subject}
                </Badge>
              )}
              {gradeLevel && (
                <Badge variant="secondary" className="font-semibold">
                  {tr("สายชั้น")}: {gradeLevel}
                </Badge>
              )}
              {isOwner && joinCode && (
                <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-sm">
                  <KeyRound className="size-4 text-primary" />
                  {tr("รหัสห้อง:")}
                  <span className="font-mono font-semibold">{joinCode}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isOwner && (
              <Button size="sm" variant="outline" onClick={openGradeDialog}>
                <Pencil className="size-4" />
                {gradeLevel ? tr("แก้สายชั้น") : tr("ตั้งสายชั้น")}
              </Button>
            )}
            {isOwner && (
              <Button asChild>
                <Link to="/quiz/new" search={{ classroom: id }}>
                  <Sparkles className="size-4" />
                  {tr("สร้าง Live Quiz")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <Dialog
        open={gradeOpen}
        onOpenChange={(next) => {
          setGradeOpen(next);
          if (!next) setGradeError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{gradeLevel ? tr("แก้สายชั้น") : tr("ตั้งสายชั้น")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="classroom-grade-level">{tr("สายชั้น")}</Label>
            <Input
              id="classroom-grade-level"
              value={gradeValue}
              onChange={(event) => {
                setGradeValue(event.target.value);
                setGradeError(null);
              }}
              placeholder={tr("เช่น ม.1, ม.2, ป.6")}
              aria-invalid={!!gradeError}
              aria-describedby={gradeError ? "classroom-grade-error" : undefined}
            />
            <p className="text-sm text-muted-foreground">
              {tr("ใช้สายชั้นเพื่อจัดอันดับและแยกภาพรวมผลการเรียนให้ตรงกลุ่ม")}
            </p>
            {gradeError && (
              <p id="classroom-grade-error" className="text-sm text-destructive">
                {gradeError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradeOpen(false)}>
              {tr("ยกเลิก")}
            </Button>
            <Button onClick={() => saveGrade.mutate()} disabled={saveGrade.isPending}>
              {saveGrade.isPending && <Loader2 className="size-4 animate-spin" />}
              {saveGrade.isPending ? tr("กำลังบันทึก") : tr("บันทึก")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClassroomStartPanel
        isOwner={isOwner}
        gradeLevel={gradeLevel}
        onSelectTab={setTab}
        onSetGrade={openGradeDialog}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start bg-secondary/70">
          <TabsTrigger value="announcements">
            <Megaphone className="size-4 mr-1" />
            {tr("ประกาศ")}
          </TabsTrigger>
          <TabsTrigger value="lessons">
            <BookOpenCheck className="size-4 mr-1" />
            {tr("บทเรียน")}
          </TabsTrigger>
          <TabsTrigger value="dailyquests">
            <Sparkles className="size-4 mr-1" />
            Daily Quest
          </TabsTrigger>
          <TabsTrigger value="materials">
            <FileText className="size-4 mr-1" />
            {tr("เอกสาร")}
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <ClipboardList className="size-4 mr-1" />
            {tr("งาน")}
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <Calendar className="size-4 mr-1" />
            {tr("เช็กชื่อ")}
          </TabsTrigger>
          <TabsTrigger value="leaderboard">
            <Trophy className="size-4 mr-1" />
            {tr("Leaderboard")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="announcements">
          <AnnouncementsTab classroomId={id} isOwner={isOwner} />
        </TabsContent>
        <TabsContent value="lessons">
          <LessonsTab classroomId={id} isOwner={isOwner} onOpenLessonDocs={openLessonDocs} />
        </TabsContent>
        <TabsContent value="dailyquests">
          <DailyQuestsTab classroomId={id} isOwner={isOwner} />
        </TabsContent>
        <TabsContent value="materials">
          <MaterialsTab
            classroomId={id}
            isOwner={isOwner}
            filter={materialsFilter}
            setFilter={setMaterialsFilter}
          />
        </TabsContent>

        <TabsContent value="assignments">
          <AssignmentsTab classroomId={id} isOwner={isOwner} ownerId={classroom.owner_id} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceTab classroomId={id} isOwner={isOwner} />
        </TabsContent>
        <TabsContent value="leaderboard">
          <LeaderboardTab classroomId={id} isOwner={isOwner} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ClassroomStartPanel({
  isOwner,
  gradeLevel,
  onSelectTab,
  onSetGrade,
}: {
  isOwner: boolean;
  gradeLevel: string | null;
  onSelectTab: (tab: string) => void;
  onSetGrade: () => void;
}) {
  const steps = isOwner
    ? [
        !gradeLevel
          ? {
              icon: <Pencil className="size-4" />,
              title: tr("ตั้งสายชั้น"),
              detail: tr("แยกอันดับและภาพรวมให้ตรงกลุ่ม"),
              onClick: onSetGrade,
            }
          : {
              icon: <BookOpenCheck className="size-4" />,
              title: tr("เพิ่มบทเรียน"),
              detail: tr("วางเนื้อหาหลักก่อนแจกงาน"),
              onClick: () => onSelectTab("lessons"),
            },
        {
          icon: <FileText className="size-4" />,
          title: tr("แนบเอกสาร"),
          detail: tr("รวมไฟล์และลิงก์ตามบทเรียน"),
          onClick: () => onSelectTab("materials"),
        },
        {
          icon: <Calendar className="size-4" />,
          title: tr("เริ่มเช็กชื่อ"),
          detail: tr("เปิดรอบเข้าเรียนพร้อม QR"),
          onClick: () => onSelectTab("attendance"),
        },
        {
          icon: <Sparkles className="size-4" />,
          title: tr("สร้าง Daily Quest"),
          detail: tr("ให้ AI ช่วยออกแบบคำถาม"),
          onClick: () => onSelectTab("dailyquests"),
        },
      ]
    : [
        {
          icon: <Megaphone className="size-4" />,
          title: tr("อ่านประกาศ"),
          detail: tr("ดูสิ่งที่ครูแจ้งล่าสุด"),
          onClick: () => onSelectTab("announcements"),
        },
        {
          icon: <BookOpenCheck className="size-4" />,
          title: tr("ทบทวนบทเรียน"),
          detail: tr("เปิดเนื้อหาที่ครูเตรียมไว้"),
          onClick: () => onSelectTab("lessons"),
        },
        {
          icon: <ClipboardList className="size-4" />,
          title: tr("ส่งงาน"),
          detail: tr("ดูงานที่ต้องทำและสถานะส่ง"),
          onClick: () => onSelectTab("assignments"),
        },
        {
          icon: <Sparkles className="size-4" />,
          title: tr("ทำ Daily Quest"),
          detail: tr("สะสม XP และทองจากบทเรียน"),
          onClick: () => onSelectTab("dailyquests"),
        },
      ];

  return (
    <section className="rounded-xl border bg-secondary/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">
            {isOwner ? tr("ลำดับเริ่มต้นสำหรับครู") : tr("เริ่มเรียนจากตรงนี้")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? tr("เลือกงานหลักของห้องนี้ได้ทันที ไม่ต้องไล่หาในทุกแท็บ")
              : tr("ทางลัดสำหรับสิ่งที่นักเรียนมักต้องทำก่อน")}
          </p>
        </div>
        {gradeLevel && (
          <Badge variant="secondary">
            {tr("สายชั้น")}: {gradeLevel}
          </Badge>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <button
            key={step.title}
            type="button"
            onClick={step.onClick}
            className="flex min-h-20 items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/45 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              {step.icon}
            </span>
            <span>
              <span className="block text-sm font-semibold">{step.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {step.detail}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MaterialsTab({
  classroomId,
  isOwner,
  filter,
  setFilter,
}: {
  classroomId: string;
  isOwner: boolean;
  filter: string;
  setFilter: (v: string) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    description: string;
    url: string;
    lesson_id: string;
  }>({ title: "", description: "", url: "", lesson_id: "none" });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // edit + copy state
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    url: string;
    lesson_id: string;
  }>({ title: "", description: "", url: "", lesson_id: "none" });
  const [copying, setCopying] = useState<MaterialRow | null>(null);
  const [copyRoom, setCopyRoom] = useState<string>("");
  const [copyLesson, setCopyLesson] = useState<string>("none");

  const { data: lessons } = useQuery({
    queryKey: ["lessons-list", classroomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_contents")
        .select("id, topic, lesson_date")
        .eq("classroom_id", classroomId)
        .order("lesson_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ownedRooms } = useQuery({
    queryKey: ["my-owned-rooms", user?.id],
    queryFn: async () =>
      (await supabase.from("classrooms").select("id, name").eq("owner_id", user!.id).order("name"))
        .data ?? [],
    enabled: !!user && isOwner,
  });

  const { data: targetLessons } = useQuery({
    queryKey: ["lessons-list", copyRoom],
    queryFn: async () =>
      (
        await supabase
          .from("lesson_contents")
          .select("id, topic, lesson_date")
          .eq("classroom_id", copyRoom)
          .order("lesson_date", { ascending: false })
      ).data ?? [],
    enabled: !!copyRoom,
  });

  const { data } = useQuery({
    queryKey: ["materials", classroomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("classroom_id", classroomId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });

  const lessonMap = new Map((lessons ?? []).map((l) => [l.id, l]));
  const filtered = (data ?? []).filter((m) => {
    if (filter === "all") return true;
    if (filter === "none") return !m.lesson_id;
    return m.lesson_id === filter;
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.title) throw new Error(tr("ใส่ชื่อเอกสาร"));
      if (!form.url && !file) throw new Error(tr("ใส่ลิงก์หรือเลือกไฟล์อย่างน้อย 1 อย่าง"));
      let url = form.url;
      if (file) {
        setUploading(true);
        const path = `${user!.id}/materials/${classroomId}/${Date.now()}-${file.name}`;
        const { error: ue } = await supabase.storage.from("uploads").upload(path, file);
        if (ue) throw ue;
        const { data: signed } = await supabase.storage
          .from("uploads")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        url = signed?.signedUrl ?? "";
      }
      const { error } = await supabase.from("materials").insert({
        classroom_id: classroomId,
        title: form.title,
        description: form.description,
        url,
        lesson_id: form.lesson_id === "none" ? null : form.lesson_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("เพิ่มแล้ว"));
      setOpen(false);
      setForm({ title: "", description: "", url: "", lesson_id: "none" });
      setFile(null);
      qc.invalidateQueries({ queryKey: ["materials", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setUploading(false),
  });

  const reassign = useMutation({
    mutationFn: async ({ id, lesson_id }: { id: string; lesson_id: string | null }) => {
      const { error } = await supabase.from("materials").update({ lesson_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ย้ายแล้ว"));
      qc.invalidateQueries({ queryKey: ["materials", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const edit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("materials")
        .update({
          title: editForm.title,
          description: editForm.description,
          url: editForm.url,
          lesson_id: editForm.lesson_id === "none" ? null : editForm.lesson_id,
        })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("บันทึกแล้ว"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["materials", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ลบแล้ว"));
      qc.invalidateQueries({ queryKey: ["materials", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = useMutation({
    mutationFn: async () => {
      if (!copying || !copyRoom) throw new Error(tr("เลือกห้องเรียนปลายทาง"));
      const { error } = await supabase.from("materials").insert({
        classroom_id: copyRoom,
        title: copying.title,
        description: copying.description,
        url: copying.url,
        lesson_id: copyLesson === "none" ? null : copyLesson,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("คัดลอกแล้ว"));
      setCopying(null);
      setCopyRoom("");
      setCopyLesson("none");
      qc.invalidateQueries({ queryKey: ["materials", copyRoom] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(m: MaterialRow) {
    setEditing(m);
    setEditForm({
      title: m.title ?? "",
      description: m.description ?? "",
      url: m.url ?? "",
      lesson_id: m.lesson_id ?? "none",
    });
  }

  function openCopy(m: MaterialRow) {
    setCopying(m);
    setCopyRoom(classroomId);
    setCopyLesson(m.lesson_id ?? "none");
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm shrink-0">{tr("เลือกบทเรียน")}</Label>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("ทั้งหมด")}</SelectItem>
              <SelectItem value="none">{tr("ยังไม่ได้จัดบทเรียน")}</SelectItem>
              {lessons?.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.topic} · {new Date(l.lesson_date).toLocaleDateString("th-TH")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isOwner && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-1" />
                {tr("เพิ่มเอกสาร")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{tr("เพิ่มเอกสาร")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{tr("ชื่อ")}</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{tr("รายละเอียด")}</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{tr("บทเรียน")}</Label>
                  <Select
                    value={form.lesson_id}
                    onValueChange={(v) => setForm({ ...form, lesson_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tr("ไม่ระบุ")}</SelectItem>
                      {lessons?.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.topic} · {new Date(l.lesson_date).toLocaleDateString("th-TH")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{tr("ลิงก์ (URL)")}</Label>
                  <Input
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder="https://..."
                    disabled={!!file}
                  />
                </div>
                <div>
                  <Label>{tr("หรืออัปโหลดไฟล์")}</Label>
                  <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  {file && (
                    <p className="text-xs text-muted-foreground mt-1">เลือกแล้ว: {file.name}</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => add.mutate()} disabled={add.isPending || uploading}>
                  {uploading ? (
                    <>
                      <Loader2 className="size-4 mr-1 animate-spin" />
                      {tr("กำลังอัปโหลด…")}
                    </>
                  ) : (
                    tr("บันทึก")
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="grid gap-3">
        {filtered.length === 0 && (
          <p className="text-muted-foreground text-sm">{tr("ยังไม่มีเอกสาร")}</p>
        )}
        {filtered.map((m) => {
          const lesson = m.lesson_id ? lessonMap.get(m.lesson_id) : null;
          return (
            <Card key={m.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{m.title}</p>
                    {lesson ? (
                      <Badge variant="secondary">
                        <BookOpenCheck className="size-3 mr-1" />
                        {lesson.topic}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{tr("ยังไม่ได้จัดบทเรียน")}</Badge>
                    )}
                  </div>
                  {m.description && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap leading-relaxed">
                      {m.description}
                    </p>
                  )}
                  {isOwner && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Select
                        value={m.lesson_id ?? "none"}
                        onValueChange={(v) =>
                          reassign.mutate({ id: m.id, lesson_id: v === "none" ? null : v })
                        }
                      >
                        <SelectTrigger className="h-8 w-[220px] text-xs">
                          <SelectValue placeholder={tr("ย้ายไปยังบทเรียน")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{tr("ไม่ระบุ")}</SelectItem>
                          {lessons?.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.topic}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => openEdit(m)}
                      >
                        {tr("แก้ไข")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => openCopy(m)}
                      >
                        {tr("คัดลอก")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive"
                        onClick={() => {
                          if (confirm(tr("ลบเอกสารนี้?"))) remove.mutate(m.id);
                        }}
                      >
                        <Trash2 className="size-3 mr-1" />
                        {tr("ลบ")}
                      </Button>
                    </div>
                  )}
                </div>
                {m.url && <MediaPreview url={m.url} alt={m.title} fallbackLabel={tr("เปิด")} />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("แก้ไขเอกสาร")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{tr("ชื่อ")}</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>{tr("รายละเอียด")}</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <div>
              <Label>{tr("ลิงก์ (URL)")}</Label>
              <Input
                value={editForm.url}
                onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
              />
            </div>
            <div>
              <Label>{tr("บทเรียน")}</Label>
              <Select
                value={editForm.lesson_id}
                onValueChange={(v) => setEditForm({ ...editForm, lesson_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tr("ไม่ระบุ")}</SelectItem>
                  {lessons?.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.topic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => edit.mutate()} disabled={edit.isPending}>
              {tr("บันทึก")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy dialog */}
      <Dialog open={!!copying} onOpenChange={(o) => !o && setCopying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("คัดลอกเอกสารไป...")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{tr("ห้องเรียนปลายทาง")}</Label>
              <Select
                value={copyRoom}
                onValueChange={(v) => {
                  setCopyRoom(v);
                  setCopyLesson("none");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr("เลือกห้องเรียน")} />
                </SelectTrigger>
                <SelectContent>
                  {ownedRooms?.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {r.id === classroomId ? ` (${tr("ห้องปัจจุบัน")})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{tr("บทเรียนปลายทาง")}</Label>
              <Select value={copyLesson} onValueChange={setCopyLesson}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tr("ไม่ระบุ")}</SelectItem>
                  {targetLessons?.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.topic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {tr("ระบบจะคัดลอกชื่อ/รายละเอียด/ลิงก์ของเอกสารไปยังปลายทาง")}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => copy.mutate()} disabled={copy.isPending || !copyRoom}>
              {tr("คัดลอก")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssignmentsTab({
  classroomId,
  isOwner,
  ownerId,
}: {
  classroomId: string;
  isOwner: boolean;
  ownerId?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    due_date: "",
    max_score: 100,
    xp_reward: 50,
    assignment_type: "individual" as "individual" | "group",
    status: "published" as "draft" | "published" | "closed",
    late_penalty_percent: 0,
    allow_late: true,
    sample_video_url: "",
  });
  const [submitFor, setSubmitFor] = useState<string | null>(null);
  const [subContent, setSubContent] = useState("");
  const [subFile, setSubFile] = useState<File | null>(null);

  const { data: assignments } = useQuery({
    queryKey: ["assignments", classroomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .eq("classroom_id", classroomId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: mySubs } = useQuery({
    queryKey: ["mysubs", classroomId, user?.id],
    queryFn: async () => {
      const ids = assignments?.map((a) => a.id) ?? [];
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .in("assignment_id", ids)
        .eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!assignments && !!user,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error(tr("ใส่ชื่องาน"));
      if (form.late_penalty_percent < 0 || form.late_penalty_percent > 100)
        throw new Error(tr("เปอร์เซ็นต์หักคะแนนต้องอยู่ระหว่าง 0-100"));
      const { error } = await supabase.from("assignments").insert({
        classroom_id: classroomId,
        title: form.title.trim().slice(0, 200),
        description: form.description ? form.description.slice(0, 5000) : null,
        due_date: form.due_date || null,
        max_score: form.max_score,
        xp_reward: form.xp_reward,
        assignment_type: form.assignment_type,
        status: form.status,
        late_penalty_percent: form.late_penalty_percent,
        allow_late: form.allow_late,
        sample_video_url: form.sample_video_url.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("สร้างงานแล้ว"));
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["assignments", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ลบงานแล้ว"));
      qc.invalidateQueries({ queryKey: ["assignments", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: async (assignmentId: string) => {
      const assignment = assignments?.find((a) => a.id === assignmentId);
      if (!assignment) throw new Error(tr("ไม่พบงาน"));
      if (assignment.status === "closed") throw new Error(tr("งานนี้ปิดรับแล้ว"));
      const now = new Date();
      const isLate = assignment.due_date ? now > new Date(assignment.due_date) : false;
      if (isLate && !assignment.allow_late) throw new Error(tr("เลยกำหนดส่งและไม่อนุญาตส่งช้า"));
      let file_url: string | null = null;
      if (subFile) {
        const path = `${user!.id}/${assignmentId}/${Date.now()}-${subFile.name}`;
        const { error: ue } = await supabase.storage.from("uploads").upload(path, subFile);
        if (ue) throw ue;
        const { data: signed } = await supabase.storage
          .from("uploads")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        file_url = signed?.signedUrl ?? null;
      }
      const { error } = await supabase.from("submissions").upsert(
        {
          assignment_id: assignmentId,
          user_id: user!.id,
          content: subContent || null,
          file_url,
          is_late: isLate,
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ส่งงานแล้ว"));
      setSubmitFor(null);
      setSubContent("");
      setSubFile(null);
      qc.invalidateQueries({ queryKey: ["mysubs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runExportGradebook = useServerFn(exportGradebook);
  const exportCsv = async () => {
    try {
      const res = await runExportGradebook({ data: { classroomId } });
      downloadCsv(res.filename, res.csv);
    } catch (error) {
      toast.error(errorMessage(error, tr("ส่งออกล้มเหลว")));
    }
  };

  return (
    <div className="space-y-4 mt-4">
      {isOwner && (
        <div className="flex items-center gap-2 flex-wrap">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-1" />
                {tr("สร้างงาน")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{tr("สร้างงาน")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{tr("ชื่องาน")}</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{tr("คำอธิบาย")}</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{tr("ประเภท")}</Label>
                    <select
                      className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                      value={form.assignment_type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          assignment_type: e.target.value as "individual" | "group",
                        })
                      }
                    >
                      <option value="individual">{tr("งานเดี่ยว")}</option>
                      <option value="group">{tr("งานกลุ่ม")}</option>
                    </select>
                  </div>
                  <div>
                    <Label>{tr("สถานะ")}</Label>
                    <select
                      className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                      value={form.status}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          status: e.target.value as "draft" | "published" | "closed",
                        })
                      }
                    >
                      <option value="draft">{tr("ร่าง")}</option>
                      <option value="published">{tr("เผยแพร่")}</option>
                      <option value="closed">{tr("ปิดรับ")}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label>{tr("กำหนดส่ง")}</Label>
                  <Input
                    type="datetime-local"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{tr("คะแนนเต็ม")}</Label>
                    <Input
                      type="number"
                      value={form.max_score}
                      onChange={(e) => setForm({ ...form, max_score: +e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{tr("XP ตอบแทน")}</Label>
                    <Input
                      type="number"
                      value={form.xp_reward}
                      onChange={(e) => setForm({ ...form, xp_reward: +e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{tr("หักคะแนนส่งช้า (%)")}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={form.late_penalty_percent}
                      onChange={(e) => setForm({ ...form, late_penalty_percent: +e.target.value })}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <input
                      id="allow-late"
                      type="checkbox"
                      checked={form.allow_late}
                      onChange={(e) => setForm({ ...form, allow_late: e.target.checked })}
                      className="size-4"
                    />
                    <Label htmlFor="allow-late" className="cursor-pointer">
                      {tr("อนุญาตส่งช้า")}
                    </Label>
                  </div>
                </div>
                <div>
                  <Label>{tr("ลิงก์วิดีโอตัวอย่าง")}</Label>
                  <Input
                    placeholder="https://..."
                    value={form.sample_video_url}
                    onChange={(e) => setForm({ ...form, sample_video_url: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {tr("สร้าง")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4 mr-1" />
            {tr("ส่งออกคะแนน (CSV)")}
          </Button>
        </div>
      )}
      <div className="grid gap-3">
        {assignments?.length === 0 && (
          <p className="text-muted-foreground text-sm">{tr("ยังไม่มีงาน")}</p>
        )}
        {assignments
          ?.filter((a) => isOwner || a.status !== "draft")
          .map((a) => {
            const mine = mySubs?.find((s) => s.assignment_id === a.id);
            const isOverdue = a.due_date && new Date() > new Date(a.due_date);
            return (
              <Card key={a.id} className={a.status === "draft" ? "border-dashed opacity-80" : ""}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-start justify-between gap-2 flex-wrap">
                    <span>{a.title}</span>
                    <div className="flex gap-1 flex-wrap">
                      {a.status === "draft" && <Badge variant="secondary">{tr("ร่าง")}</Badge>}
                      {a.status === "closed" && <Badge variant="destructive">{tr("ปิดรับ")}</Badge>}
                      {a.assignment_type === "group" && (
                        <Badge variant="outline">{tr("กลุ่ม")}</Badge>
                      )}
                      <Badge variant="outline">เต็ม {a.max_score}</Badge>
                      {isOwner && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive"
                          onClick={() => {
                            if (confirm(tr("ลบงานนี้?"))) removeAssignment.mutate(a.id);
                          }}
                        >
                          <Trash2 className="size-3 mr-1" />
                          {tr("ลบ")}
                        </Button>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {a.description && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {a.description}
                    </p>
                  )}
                  {a.due_date && (
                    <p className={`text-xs ${isOverdue ? "text-destructive font-medium" : ""}`}>
                      {tr("กำหนดส่ง")}: {new Date(a.due_date).toLocaleString("th-TH")}
                      {isOverdue && ` • ${tr("เลยกำหนดแล้ว")}`}
                      {a.late_penalty_percent > 0 &&
                        ` • ${tr("ส่งช้าหัก")} ${a.late_penalty_percent}%`}
                      {!a.allow_late && ` • ${tr("ไม่รับงานช้า")}`}
                    </p>
                  )}
                  {a.sample_video_url && (
                    <a
                      href={a.sample_video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                    >
                      {tr("ดูวิดีโอตัวอย่าง")}
                    </a>
                  )}
                  {isOwner ? (
                    <SubmissionsList
                      assignmentId={a.id}
                      maxScore={a.max_score}
                      xpReward={a.xp_reward}
                    />
                  ) : (
                    <div>
                      {mine ? (
                        <div className="text-sm space-y-1">
                          <div className="flex gap-1 flex-wrap">
                            <Badge className="bg-green-100 text-green-900">{tr("ส่งแล้ว")}</Badge>
                            {mine.is_late && <Badge variant="destructive">{tr("ส่งช้า")}</Badge>}
                          </div>
                          {mine.score != null && (
                            <p>
                              {tr("คะแนน:")}
                              <span className="font-semibold">
                                {mine.score}/{a.max_score}
                              </span>
                            </p>
                          )}
                          {mine.feedback && (
                            <p className="text-muted-foreground">ความคิดเห็น: {mine.feedback}</p>
                          )}
                        </div>
                      ) : a.status === "closed" ? (
                        <p className="text-sm text-muted-foreground">{tr("งานนี้ปิดรับแล้ว")}</p>
                      ) : isOverdue && !a.allow_late ? (
                        <p className="text-sm text-destructive">
                          {tr("เลยกำหนดส่งและไม่อนุญาตส่งช้า")}
                        </p>
                      ) : submitFor === a.id ? (
                        <div className="space-y-2">
                          <Textarea
                            placeholder={tr("ข้อความ/คำตอบ")}
                            value={subContent}
                            onChange={(e) => setSubContent(e.target.value)}
                          />
                          <Input
                            type="file"
                            onChange={(e) => setSubFile(e.target.files?.[0] ?? null)}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => submit.mutate(a.id)}
                              disabled={submit.isPending}
                            >
                              <Upload className="size-4 mr-1" />
                              {tr("ส่ง")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setSubmitFor(null)}>
                              {tr("ยกเลิก")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" onClick={() => setSubmitFor(a.id)}>
                          {isOverdue ? tr("ส่งงาน (ช้า)") : tr("ส่งงาน")}
                        </Button>
                      )}
                    </div>
                  )}
                  <AssignmentComments assignmentId={a.id} classroomOwnerId={ownerId} />
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}

function SubmissionsList({
  assignmentId,
  maxScore,
  xpReward,
}: {
  assignmentId: string;
  maxScore: number;
  xpReward: number;
}) {
  const qc = useQueryClient();
  const { data: subs } = useQuery({
    queryKey: ["subs", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*, profiles!submissions_user_id_fkey(display_name)")
        .eq("assignment_id", assignmentId);
      if (error) {
        // fallback without join
        const { data: d2 } = await supabase
          .from("submissions")
          .select("*")
          .eq("assignment_id", assignmentId);
        return (d2 ?? []) as SubmissionRow[];
      }
      return (data ?? []) as unknown as SubmissionRow[];
    },
  });

  const grade = useMutation({
    mutationFn: async ({
      id,
      score,
      feedback,
    }: {
      id: string;
      score: number;
      feedback: string;
      userId: string;
    }) => {
      // XP/Gold ถูกแจกอัตโนมัติโดย DB trigger `submissions_award_xp` ห้ามแจกซ้ำที่ client
      const { error } = await supabase
        .from("submissions")
        .update({ score, feedback, graded_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ให้คะแนนแล้ว"));
      qc.invalidateQueries({ queryKey: ["subs", assignmentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">การส่งงาน ({subs?.length ?? 0})</p>
      {subs?.length === 0 && (
        <p className="text-xs text-muted-foreground">{tr("ยังไม่มีใครส่ง")}</p>
      )}
      {subs?.map((s) => (
        <GradeRow
          key={s.id}
          sub={s}
          maxScore={maxScore}
          onGrade={(score, feedback) =>
            grade.mutate({ id: s.id, score, feedback, userId: s.user_id })
          }
        />
      ))}
    </div>
  );
}

function GradeRow({
  sub,
  maxScore,
  onGrade,
}: {
  sub: SubmissionRow;
  maxScore: number;
  onGrade: (score: number, fb: string) => void;
}) {
  const [score, setScore] = useState(sub.score ?? 0);
  const [fb, setFb] = useState(sub.feedback ?? "");
  return (
    <Card className="bg-muted/30">
      <CardContent className="pt-4 space-y-2">
        <p className="text-xs text-muted-foreground">
          นักเรียน: {sub.profiles?.display_name ?? sub.user_id.slice(0, 8)}
        </p>
        {sub.content && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{sub.content}</p>
        )}
        {sub.file_url && (
          <MediaPreview
            url={sub.file_url}
            alt="ไฟล์แนบ"
            fallbackLabel={tr("ไฟล์แนบ")}
            thumbClassName="h-24 w-auto max-w-[160px]"
          />
        )}
        <div className="flex items-center gap-2">
          <Input
            type="number"
            max={maxScore}
            value={score}
            onChange={(e) => setScore(+e.target.value)}
            className="w-24"
          />
          <span className="text-xs">/ {maxScore}</span>
          <Input
            value={fb}
            onChange={(e) => setFb(e.target.value)}
            placeholder={tr("ความคิดเห็น")}
          />
          <Button size="sm" onClick={() => onGrade(score, fb)}>
            {tr("บันทึก")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AttendanceTab({ classroomId, isOwner }: { classroomId: string; isOwner: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");

  const { data: sessions } = useQuery({
    queryKey: ["att-sessions", classroomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_sessions_safe")
        .select("*")
        .eq("classroom_id", classroomId)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceSessionRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!title) throw new Error(tr("ใส่ชื่อ"));
      const { error } = await supabase
        .from("attendance_sessions")
        .insert({ classroom_id: classroomId, title });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("สร้างเซสชันแล้ว"));
      setTitle("");
      qc.invalidateQueries({ queryKey: ["att-sessions", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runExportAttendance = useServerFn(exportAttendance);
  const handleExport = async () => {
    try {
      const res = await runExportAttendance({ data: { classroomId } });
      downloadCsv(res.filename, res.csv);
    } catch (error) {
      toast.error(errorMessage(error, tr("ส่งออกล้มเหลว")));
    }
  };

  return (
    <div className="space-y-4 mt-4">
      {isOwner && (
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder={tr("ชื่อเซสชัน เช่น คาบที่ 1")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button onClick={() => create.mutate()}>
            <Plus className="size-4 mr-1" />
            {tr("สร้าง")}
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="size-4 mr-1" />
            {tr("ส่งออกการเข้าชั้นเรียน (CSV)")}
          </Button>
        </div>
      )}
      <div className="space-y-3">
        {sessions?.length === 0 && (
          <p className="text-muted-foreground text-sm">{tr("ยังไม่มีเซสชัน")}</p>
        )}
        {sessions?.map((s) => (
          <AttendanceSession
            key={s.id}
            session={s}
            classroomId={classroomId}
            isOwner={isOwner}
            userId={user!.id}
          />
        ))}
      </div>
    </div>
  );
}

function AttendanceSession({
  session,
  classroomId,
  isOwner,
  userId,
}: {
  session: AttendanceSessionRow;
  classroomId: string;
  isOwner: boolean;
  userId: string;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const sessionId = session.id ?? "";
  const { data: members } = useQuery({
    queryKey: ["att-members", classroomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classroom_members")
        .select("user_id, profiles(display_name)")
        .eq("classroom_id", classroomId);
      if (error) throw error;
      return (data ?? []) as unknown as AttendanceMemberRow[];
    },
    enabled: isOwner,
  });

  const { data: records } = useQuery({
    queryKey: ["att-records", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("session_id", sessionId);
      if (error) throw error;
      return (data ?? []) as AttendanceRecordRow[];
    },
    enabled: !!sessionId,
    refetchInterval: isOwner ? 5000 : false,
  });

  const mark = useMutation({
    mutationFn: async ({
      uid,
      status,
    }: {
      uid: string;
      status: "present" | "late" | "absent" | "excused";
    }) => {
      const { error } = await supabase
        .from("attendance_records")
        .upsert(
          { session_id: sessionId, user_id: uid, status },
          { onConflict: "session_id,user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["att-records", sessionId] }),
  });

  const openCode = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("open_attendance_check_in", {
        p_session_id: sessionId,
        p_minutes: 15,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("เปิดรหัสเช็กชื่อแล้ว 15 นาที"));
      qc.invalidateQueries({ queryKey: ["att-sessions", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkIn = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("self_check_in", { p_code: code.trim() });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { status?: AttendanceStatus } | null;
      return row?.status;
    },
    onSuccess: (status) => {
      const xp = status === "late" ? 5 : 15;
      const gold = status === "late" ? 2 : 5;
      toast.success(`${tr("เช็กชื่อสำเร็จ")} ✓ +${xp} XP, +${gold} ${tr("ทอง")}`);
      setCode("");
      qc.invalidateQueries({ queryKey: ["att-records", sessionId] });
      qc.invalidateQueries({ queryKey: ["profile", userId] });
      qc.invalidateQueries({ queryKey: ["my-attendance-history", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const codeActive =
    session.check_in_code &&
    session.check_in_expires_at &&
    new Date(session.check_in_expires_at) > new Date();
  const myRecord = records?.find((r) => r.user_id === userId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between gap-2">
          <span>
            {session.title}{" "}
            <span className="text-xs text-muted-foreground font-normal ml-2">
              {session.session_date
                ? new Date(session.session_date).toLocaleDateString("th-TH")
                : "—"}
            </span>
          </span>
          {codeActive && (
            <Badge variant="secondary" className="font-mono text-base">
              <Timer className="size-3 mr-1" />
              {session.check_in_code}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isOwner ? (
          <>
            <div className="flex items-center gap-2 p-3 rounded-md bg-muted/40">
              <KeyRound className="size-4 text-muted-foreground" />
              {codeActive ? (
                <div className="flex-1 flex items-start gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">
                      {tr("ให้นักเรียนพิมพ์รหัสนี้ หรือสแกน QR")}
                    </p>
                    <p className="font-mono text-3xl font-bold tracking-widest">
                      {session.check_in_code}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {tr("หมดอายุ")}{" "}
                      {session.check_in_expires_at
                        ? new Date(session.check_in_expires_at).toLocaleTimeString("th-TH", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}{" "}
                      • {tr("มา")} {records?.length ?? 0}/{members?.length ?? 0}
                    </p>
                  </div>
                  <CheckInQR code={session.check_in_code ?? ""} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground flex-1">
                  {tr("ยังไม่ได้เปิดให้เช็กชื่อ")}
                </p>
              )}
              <Button
                size="sm"
                variant={codeActive ? "outline" : "default"}
                onClick={() => openCode.mutate()}
                disabled={openCode.isPending}
              >
                {codeActive ? tr("สุ่มใหม่") : tr("เปิดเช็กชื่อ")}
              </Button>
            </div>
            <div className="space-y-1">
              {members?.length === 0 && (
                <p className="text-xs text-muted-foreground">{tr("ยังไม่มีสมาชิก")}</p>
              )}
              {members?.map((m) => {
                const rec = records?.find((r) => r.user_id === m.user_id);
                return (
                  <div key={m.user_id} className="flex items-center justify-between gap-2 py-1">
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {m.profiles?.display_name ?? m.user_id.slice(0, 8)}
                      </span>
                      {rec?.marked_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(rec.marked_at).toLocaleString("th-TH", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      )}
                    </div>
                    <Select
                      value={rec?.status ?? ""}
                      onValueChange={(v) =>
                        mark.mutate({ uid: m.user_id, status: v as AttendanceStatus })
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">{tr("มา")}</SelectItem>
                        <SelectItem value="late">{tr("สาย")}</SelectItem>
                        <SelectItem value="absent">{tr("ขาด")}</SelectItem>
                        <SelectItem value="excused">{tr("ลา")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">
              {tr("สถานะของฉัน")}:{" "}
              {myRecord ? (
                <>
                  <Badge variant={myRecord.status === "present" ? "default" : "secondary"}>
                    {myRecord.status}
                  </Badge>
                  {myRecord.marked_at && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {new Date(myRecord.marked_at).toLocaleString("th-TH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">{tr("ยังไม่ได้เช็กชื่อ")}</span>
              )}
            </p>
            {!myRecord && (
              <div className="flex gap-2">
                <Input
                  placeholder={tr("กรอกรหัส 6 หลัก")}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                  className="font-mono text-lg tracking-widest"
                />
                <Button
                  onClick={() => checkIn.mutate()}
                  disabled={checkIn.isPending || code.length < 4}
                >
                  {tr("เช็กชื่อ")}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AnnouncementsTab({ classroomId, isOwner }: { classroomId: string; isOwner: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", body: "" });
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [editForm, setEditForm] = useState({ title: "", body: "" });

  const { data } = useQuery({
    queryKey: ["announcements", classroomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*, profiles!announcements_author_id_fkey(display_name)")
        .eq("classroom_id", classroomId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) {
        const { data: d2, error: e2 } = await supabase
          .from("announcements")
          .select("*")
          .eq("classroom_id", classroomId)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false });
        if (e2) throw e2;
        return (d2 ?? []) as AnnouncementRow[];
      }
      return (data ?? []) as unknown as AnnouncementRow[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error(tr("ใส่หัวข้อ"));
      const { error } = await supabase.from("announcements").insert({
        classroom_id: classroomId,
        author_id: user!.id,
        title: form.title,
        body: form.body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ประกาศแล้ว"));
      setForm({ title: "", body: "" });
      qc.invalidateQueries({ queryKey: ["announcements", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      if (!editForm.title.trim()) throw new Error(tr("ใส่หัวข้อ"));
      const { error } = await supabase
        .from("announcements")
        .update({ title: editForm.title, body: editForm.body })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("แก้ไขประกาศแล้ว"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["announcements", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: boolean }) => {
      const { error } = await supabase
        .from("announcements")
        .update({ is_pinned: pin })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements", classroomId] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ลบแล้ว"));
      qc.invalidateQueries({ queryKey: ["announcements", classroomId] });
    },
  });

  function openEdit(a: AnnouncementRow) {
    setEditing(a);
    setEditForm({ title: a.title ?? "", body: a.body ?? "" });
  }

  return (
    <div className="space-y-4 mt-4">
      {isOwner && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <Input
              placeholder={tr("หัวข้อประกาศ")}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <Textarea
              placeholder={tr("รายละเอียด (ไม่บังคับ)")}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={3}
            />
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              <Megaphone className="size-4 mr-1" />
              {tr("ประกาศ")}
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {data?.length === 0 && (
          <p className="text-muted-foreground text-sm">{tr("ยังไม่มีประกาศ")}</p>
        )}
        {data?.map((a) => (
          <Card key={a.id} className={a.is_pinned ? "border-primary/60" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-start justify-between gap-2">
                <span className="flex items-center gap-2">
                  {a.is_pinned && <Pin className="size-4 text-primary" />}
                  {a.title}
                </span>
                {isOwner && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => togglePin.mutate({ id: a.id, pin: !a.is_pinned })}
                    >
                      <Pin className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(a.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {a.body && <p className="text-sm whitespace-pre-wrap leading-relaxed">{a.body}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                {a.profiles?.display_name ?? tr("ครู")} •{" "}
                {new Date(a.created_at).toLocaleString("th-TH")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("แก้ไขประกาศ")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{tr("หัวข้อ")}</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>{tr("รายละเอียด")}</Label>
              <Textarea
                value={editForm.body}
                onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {tr("ยกเลิก")}
            </Button>
            <Button onClick={() => update.mutate()} disabled={update.isPending}>
              {tr("บันทึก")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============== LESSONS TAB ==============
function LessonsTab({
  classroomId,
  isOwner,
  onOpenLessonDocs,
}: {
  classroomId: string;
  isOwner: boolean;
  onOpenLessonDocs?: (lessonId: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ topic: "", content: "" });
  const { user } = useAuth();

  const [editing, setEditing] = useState<LessonRow | null>(null);
  const [editForm, setEditForm] = useState({ topic: "", content: "" });
  const [copying, setCopying] = useState<LessonRow | null>(null);
  const [copyRoom, setCopyRoom] = useState<string>("");
  const [includeDocs, setIncludeDocs] = useState(true);

  const { data: lessons } = useQuery({
    queryKey: ["lessons", classroomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_contents")
        .select("*")
        .eq("classroom_id", classroomId)
        .order("lesson_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LessonRow[];
    },
  });

  const { data: ownedRooms } = useQuery({
    queryKey: ["my-owned-rooms", user?.id],
    queryFn: async () =>
      (await supabase.from("classrooms").select("id, name").eq("owner_id", user!.id).order("name"))
        .data ?? [],
    enabled: !!user && isOwner,
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.topic || !form.content) throw new Error(tr("ใส่หัวข้อและเนื้อหา"));
      const { error } = await supabase.from("lesson_contents").insert({
        classroom_id: classroomId,
        topic: form.topic,
        content: form.content,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("บันทึกบทเรียนแล้ว"));
      setForm({ topic: "", content: "" });
      qc.invalidateQueries({ queryKey: ["lessons", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lesson_contents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ลบแล้ว"));
      qc.invalidateQueries({ queryKey: ["lessons", classroomId] });
    },
  });

  const edit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("lesson_contents")
        .update({ topic: editForm.topic, content: editForm.content })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("บันทึกแล้ว"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["lessons", classroomId] });
      qc.invalidateQueries({ queryKey: ["lessons-list", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = useMutation({
    mutationFn: async () => {
      if (!copying || !copyRoom) throw new Error(tr("เลือกห้องเรียนปลายทาง"));
      const { data: newLesson, error } = await supabase
        .from("lesson_contents")
        .insert({
          classroom_id: copyRoom,
          topic: copying.topic,
          content: copying.content,
          created_by: user!.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (includeDocs) {
        const { data: docs } = await supabase
          .from("materials")
          .select("title, description, url")
          .eq("classroom_id", classroomId)
          .eq("lesson_id", copying.id);
        if (docs && docs.length > 0) {
          const rows = docs.map((d) => ({
            classroom_id: copyRoom,
            title: d.title,
            description: d.description,
            url: d.url,
            lesson_id: newLesson.id,
          }));
          const { error: e2 } = await supabase.from("materials").insert(rows);
          if (e2) throw e2;
        }
      }
    },
    onSuccess: () => {
      toast.success(tr("คัดลอกแล้ว"));
      setCopying(null);
      setCopyRoom("");
      qc.invalidateQueries({ queryKey: ["lessons", copyRoom] });
      qc.invalidateQueries({ queryKey: ["materials", copyRoom] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(l: LessonRow) {
    setEditing(l);
    setEditForm({ topic: l.topic, content: l.content });
  }
  function openCopy(l: LessonRow) {
    setCopying(l);
    setCopyRoom(classroomId);
    setIncludeDocs(true);
  }

  return (
    <div className="space-y-4 mt-4">
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tr("บันทึกบทเรียนวันนี้")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder={tr("หัวข้อ เช่น การบวกเลข 1 หลัก")}
              value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
            />
            <Textarea
              placeholder={tr("เนื้อหาที่สอน รายละเอียด ตัวอย่าง...")}
              rows={6}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              <Plus className="size-4 mr-1" />
              {tr("บันทึก")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {tr(
                "บทเรียนจะถูกใช้สร้าง Daily Quest และเป็นขอบเขตของ AI ติวเตอร์ส่วนตัวให้นักเรียน",
              )}
            </p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-3">
        {lessons?.length === 0 && (
          <p className="text-muted-foreground text-sm">{tr("ยังไม่มีบทเรียน")}</p>
        )}
        {lessons?.map((l) => (
          <Card key={l.id} className="transition-colors hover:border-primary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onOpenLessonDocs?.(l.id)}
                  className="text-left hover:text-primary inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                  title={tr("ดูเอกสารของบทเรียนนี้")}
                >
                  <FileText className="size-4 opacity-70" />
                  <span>{l.topic}</span>
                </button>
                <span className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {new Date(l.lesson_date).toLocaleDateString("th-TH")}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => onOpenLessonDocs?.(l.id)}
                  >
                    <FileText className="size-3 mr-1" />
                    {tr("ดูเอกสาร")}
                  </Button>
                  {isOwner && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => openEdit(l)}
                      >
                        {tr("แก้ไข")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => openCopy(l)}
                      >
                        {tr("คัดลอก")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive"
                        onClick={() => {
                          if (confirm(tr("ลบบทเรียนนี้?"))) del.mutate(l.id);
                        }}
                      >
                        <Trash2 className="size-3 mr-1" />
                        {tr("ลบ")}
                      </Button>
                    </>
                  )}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{l.content}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit lesson */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("แก้ไขบทเรียน")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{tr("หัวข้อ")}</Label>
              <Input
                value={editForm.topic}
                onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
              />
            </div>
            <div>
              <Label>{tr("เนื้อหา")}</Label>
              <Textarea
                rows={8}
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => edit.mutate()} disabled={edit.isPending}>
              {tr("บันทึก")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy lesson */}
      <Dialog open={!!copying} onOpenChange={(o) => !o && setCopying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("คัดลอกบทเรียนไป...")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{tr("ห้องเรียนปลายทาง")}</Label>
              <Select value={copyRoom} onValueChange={setCopyRoom}>
                <SelectTrigger>
                  <SelectValue placeholder={tr("เลือกห้องเรียน")} />
                </SelectTrigger>
                <SelectContent>
                  {ownedRooms?.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {r.id === classroomId ? ` (${tr("ห้องปัจจุบัน")})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={includeDocs}
                onChange={(e) => setIncludeDocs(e.target.checked)}
                className="size-4"
              />
              <span>{tr("คัดลอกเอกสารในบทเรียนนี้ไปด้วย")}</span>
            </label>
          </div>
          <DialogFooter>
            <Button onClick={() => copy.mutate()} disabled={copy.isPending || !copyRoom}>
              {tr("คัดลอก")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============== DAILY QUESTS TAB ==============
function DailyQuestsTab({ classroomId, isOwner }: { classroomId: string; isOwner: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [genOpen, setGenOpen] = useState(false);
  const [lessonId, setLessonId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<DailyQuestPreview | null>(null);

  const { data: lessons } = useQuery({
    queryKey: ["lessons-for-quest", classroomId],
    queryFn: async () =>
      (
        await supabase
          .from("lesson_contents")
          .select("id,topic,content")
          .eq("classroom_id", classroomId)
          .order("lesson_date", { ascending: false })
      ).data ?? [],
  });

  const { data: quests } = useQuery({
    queryKey: ["dquests", classroomId],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_quests_safe")
        .select("*")
        .eq("classroom_id", classroomId)
        .order("created_at", { ascending: false });
      return (data ?? []) as DailyQuestRow[];
    },
  });

  const { data: attempts } = useQuery({
    queryKey: ["my-dq-attempts", user?.id],
    queryFn: async () =>
      (await supabase.from("daily_quest_attempts").select("*").eq("user_id", user!.id)).data ?? [],
    enabled: !!user,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () =>
      (await supabase.from("profiles").select("*").eq("id", user!.id).single()).data,
    enabled: !!user,
  });

  async function generate() {
    const lesson = lessons?.find((l) => l.id === lessonId);
    if (!lesson) {
      toast.error(tr("เลือกบทเรียน"));
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-daily-quest", {
        body: { topic: lesson.topic, content: lesson.content },
      });
      if (error) throw error;
      const generated = data as Partial<DailyQuestPreview> & { error?: unknown };
      if (generated.error)
        throw new Error(
          typeof generated.error === "string" ? generated.error : tr("AI สร้างคำถามไม่สำเร็จ"),
        );
      setPreview({
        title: generated.title ?? tr("Daily Quest"),
        topic: lesson.topic,
        lesson_id: lesson.id,
        questions: generated.questions ?? [],
        min_level: generated.min_level ?? 1,
        max_xp_reward: generated.max_xp_reward ?? 100,
        max_gold_reward: generated.max_gold_reward ?? 30,
        difficulty: generated.difficulty ?? "normal",
      });
    } catch (error) {
      toast.error(errorMessage(error, tr("ผิดพลาด")));
    } finally {
      setGenerating(false);
    }
  }

  async function saveQuest() {
    if (!preview) return;
    const { error } = await supabase.from("daily_quests").insert({
      classroom_id: classroomId,
      lesson_id: preview.lesson_id,
      title: preview.title,
      topic: preview.topic,
      questions: preview.questions,
      min_level: preview.min_level ?? 1,
      max_xp_reward: preview.max_xp_reward ?? 100,
      max_gold_reward: preview.max_gold_reward ?? 30,
      difficulty: preview.difficulty ?? "normal",
      created_by: user!.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(tr("บันทึก Daily Quest แล้ว"));
    setGenOpen(false);
    setPreview(null);
    setLessonId("");
    qc.invalidateQueries({ queryKey: ["dquests", classroomId] });
  }

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_quests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ลบแล้ว"));
      qc.invalidateQueries({ queryKey: ["dquests", classroomId] });
    },
  });

  return (
    <div className="space-y-4 mt-4">
      {isOwner && (
        <Dialog
          open={genOpen}
          onOpenChange={(o) => {
            setGenOpen(o);
            if (!o) setPreview(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Sparkles className="size-4 mr-1" />
              {tr("ให้ AI ออกแบบ Daily Quest")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{tr("AI ออกแบบ Daily Quest ให้อัตโนมัติ")}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {tr(
                  "เลือกบทเรียน แล้ว AI จะออกแบบทุกอย่างให้: 5 ข้อ ไล่ความยากจากง่ายมาก → ยากมาก, เลเวลขั้นต่ำ, XP/ทองรางวัล",
                )}
              </p>
            </DialogHeader>
            {!preview ? (
              <div className="space-y-3">
                <div>
                  <Label>{tr("เลือกบทเรียน")}</Label>
                  <Select value={lessonId} onValueChange={setLessonId}>
                    <SelectTrigger>
                      <SelectValue placeholder={tr("เลือก...")} />
                    </SelectTrigger>
                    <SelectContent>
                      {lessons?.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.topic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={generate} disabled={generating || !lessonId} className="w-full">
                  {generating ? (
                    <>
                      <Loader2 className="size-4 mr-1 animate-spin" />
                      {tr("AI กำลังออกแบบ…")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4 mr-1" />
                      {tr("ให้ AI ออกแบบให้เลย")}
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h3 className="font-display text-lg">{preview.title}</h3>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className="capitalize">

                      {preview.difficulty}
                    </Badge>
                    <Badge variant="outline">{preview.max_xp_reward} XP</Badge>
                    <Badge variant="outline">{preview.max_gold_reward} ทอง</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  {preview.questions?.map((q, i) => (
                    <Card key={i}>
                      <CardContent className="pt-4 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">
                            {i + 1}. {q.question}
                          </p>
                          {q.difficulty_label && (
                            <Badge variant="secondary" className="ml-2 shrink-0">
                              {q.difficulty_label}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">เฉลย: {q.expected_answer}</p>
                        <p className="text-xs">คะแนน: {q.points}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setPreview(null)}>
                    {tr("ออกแบบใหม่")}
                  </Button>
                  <Button onClick={saveQuest}>{tr("บันทึก Quest นี้")}</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quests?.length === 0 && (
          <p className="text-muted-foreground text-sm">{tr("ยังไม่มี Practice Quest")}</p>
        )}
        {quests?.map((q) => {
          const att = attempts?.find((a) => a.quest_id === q.id);
          const locked = false;
          if (isOwner) {
            return (
              <div key={q.id ?? q.title ?? q.topic ?? "daily-quest"} className="relative">
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute -right-3 -top-3 z-20 size-11 rounded-md border bg-background shadow-sm hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => q.id && del.mutate(q.id)}
                  disabled={!q.id || del.isPending}
                  title={tr("ลบ")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
                <QuestCard
                  quest={q}
                  attempt={att}
                  locked={locked}
                  playerLevel={profile?.level ?? 1}
                  playerXp={profile?.xp ?? 0}
                  mode="teacher"
                  onDone={() => {
                    qc.invalidateQueries({ queryKey: ["my-dq-attempts"] });
                    qc.invalidateQueries({ queryKey: ["profile"] });
                  }}
                />
              </div>
            );
          }
          return (
            <StudentQuestQuestions
              key={q.id}
              quest={q}
              attempt={att}
              locked={locked}
              playerLevel={profile?.level ?? 1}
              playerXp={profile?.xp ?? 0}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["my-dq-attempts"] });
                qc.invalidateQueries({ queryKey: ["profile"] });
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function LeaderboardTab({ classroomId, isOwner }: { classroomId: string; isOwner: boolean }) {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<
    Record<
      string,
      { xp: number; quests_completed: number; streak_days: number; perfect_scores: number }
    >
  >({});

  const { data: members } = useQuery({
    queryKey: ["classroom-members-profiles", classroomId],
    queryFn: async () => {
      const { data: cm, error } = await supabase
        .from("classroom_members")
        .select("user_id")
        .eq("classroom_id", classroomId);
      if (error) throw error;
      const ids = (cm ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [] as ClassroomMemberProfile[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      return (profs ?? []) as ClassroomMemberProfile[];
    },
  });

  const { data: scores } = useQuery({
    queryKey: ["classroom-scores", classroomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classroom_scores")
        .select("*")
        .eq("classroom_id", classroomId);
      if (error) throw error;
      return (data ?? []) as ClassroomScoreRow[];
    },
  });

  const scoreMap = new Map((scores ?? []).map((s) => [s.user_id, s]));
  const rows = (members ?? [])
    .map((m) => {
      const s = scoreMap.get(m.id);
      return {
        user_id: m.id as string,
        display_name: (m.display_name ?? "Anonymous") as string,
        avatar_url: m.avatar_url as string | null,
        xp: (s?.xp ?? 0) as number,
        quests_completed: (s?.quests_completed ?? 0) as number,
        streak_days: (s?.streak_days ?? 0) as number,
        perfect_scores: (s?.perfect_scores ?? 0) as number,
      };
    })
    .sort((a, b) => b.xp - a.xp);

  const save = useMutation({
    mutationFn: async (userId: string) => {
      const e = edits[userId];
      if (!e) return;
      const { error } = await supabase
        .from("classroom_scores")
        .upsert(
          { classroom_id: classroomId, user_id: userId, ...e },
          { onConflict: "classroom_id,user_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, userId) => {
      toast.success(tr("บันทึกแล้ว"));
      setEdits((prev) => {
        const { [userId]: _x, ...rest } = prev;
        return rest;
      });
      qc.invalidateQueries({ queryKey: ["classroom-scores", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function getEdit(r: (typeof rows)[number]) {
    return (
      edits[r.user_id] ?? {
        xp: r.xp,
        quests_completed: r.quests_completed,
        streak_days: r.streak_days,
        perfect_scores: r.perfect_scores,
      }
    );
  }

  function setEdit(
    userId: string,
    patch: Partial<{
      xp: number;
      quests_completed: number;
      streak_days: number;
      perfect_scores: number;
    }>,
  ) {
    setEdits((prev) => {
      const base =
        prev[userId] ??
        (() => {
          const r = rows.find((x) => x.user_id === userId)!;
          return {
            xp: r.xp,
            quests_completed: r.quests_completed,
            streak_days: r.streak_days,
            perfect_scores: r.perfect_scores,
          };
        })();
      return { ...prev, [userId]: { ...base, ...patch } };
    });
  }

  return (
    <div className="space-y-3 mt-4">
      <p className="text-sm text-muted-foreground">
        {isOwner
          ? tr("ครูสามารถกำหนดคะแนนนักเรียนแต่ละคนได้ที่นี่ คะแนนนี้จะแสดงบน Hall of Fame")
          : tr("อันดับคะแนนของห้องเรียน")}
      </p>
      {rows.length === 0 && (
        <p className="text-muted-foreground text-sm">{tr("ยังไม่มีนักเรียนในห้อง")}</p>
      )}
      <div className="grid gap-2">
        {rows.map((r, i) => {
          const e = getEdit(r);
          const dirty = !!edits[r.user_id];
          return (
            <Card key={r.user_id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-xl font-display w-8 text-center">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.display_name}</p>
                  </div>
                </div>
                {isOwner ? (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                    <div>
                      <Label className="text-xs">XP</Label>
                      <Input
                        type="number"
                        value={e.xp}
                        onChange={(ev) => setEdit(r.user_id, { xp: Number(ev.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{tr("เควสต์")}</Label>
                      <Input
                        type="number"
                        value={e.quests_completed}
                        onChange={(ev) =>
                          setEdit(r.user_id, { quests_completed: Number(ev.target.value) || 0 })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{tr("สตรีค")}</Label>
                      <Input
                        type="number"
                        value={e.streak_days}
                        onChange={(ev) =>
                          setEdit(r.user_id, { streak_days: Number(ev.target.value) || 0 })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Perfect</Label>
                      <Input
                        type="number"
                        value={e.perfect_scores}
                        onChange={(ev) =>
                          setEdit(r.user_id, { perfect_scores: Number(ev.target.value) || 0 })
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={!dirty || save.isPending}
                      onClick={() => save.mutate(r.user_id)}
                    >
                      {tr("บันทึก")}
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 text-center text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">XP</p>
                      <p className="font-display">{r.xp}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{tr("เควสต์")}</p>
                      <p className="font-display">{r.quests_completed}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{tr("สตรีค")}</p>
                      <p className="font-display">{r.streak_days}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Perfect</p>
                      <p className="font-display">{r.perfect_scores}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
