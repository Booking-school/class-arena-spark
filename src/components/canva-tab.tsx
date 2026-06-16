import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, ExternalLink, Trash2, Pencil, Palette, Loader2, X } from "lucide-react";
import { tr } from "@/i18n";

type Member = { id: string; display_name: string | null; avatar_url: string | null };
type SessionRow = {
  id: string;
  classroom_id: string;
  title: string;
  description: string | null;
  created_at: string;
};
type AssignmentRow = {
  id: string;
  session_id: string;
  student_id: string;
  canva_url: string;
  opened_at: string | null;
};

function isValidCanvaUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return /(^|\.)canva\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

export function CanvaTab({ classroomId, isOwner }: { classroomId: string; isOwner: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: sessions } = useQuery({
    queryKey: ["canva-sessions", classroomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canva_sessions")
        .select("id, classroom_id, title, description, created_at")
        .eq("classroom_id", classroomId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["canva-assignments", classroomId, isOwner, user?.id],
    queryFn: async () => {
      const sessIds = (sessions ?? []).map((s) => s.id);
      if (sessIds.length === 0) return [] as AssignmentRow[];
      const { data, error } = await supabase
        .from("canva_assignments")
        .select("id, session_id, student_id, canva_url, opened_at")
        .in("session_id", sessIds);
      if (error) throw error;
      return (data ?? []) as AssignmentRow[];
    },
    enabled: !!sessions && sessions.length > 0,
  });

  const { data: members } = useQuery({
    queryKey: ["canva-members", classroomId],
    queryFn: async () => {
      const { data: cm, error } = await supabase
        .from("classroom_members")
        .select("user_id")
        .eq("classroom_id", classroomId);
      if (error) throw error;
      const ids = (cm ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [] as Member[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      return ((profs ?? []) as Member[]).sort((a, b) =>
        (a.display_name ?? "").localeCompare(b.display_name ?? "", "th"),
      );
    },
    enabled: isOwner,
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.from("canva_sessions").delete().eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ลบแล้ว"));
      qc.invalidateQueries({ queryKey: ["canva-sessions", classroomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markOpened = useMutation({
    mutationFn: async (assignmentId: string) => {
      await supabase
        .from("canva_assignments")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", assignmentId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["canva-assignments", classroomId] });
    },
  });

  const assignmentsBySession = (sid: string) =>
    (assignments ?? []).filter((a) => a.session_id === sid);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Palette className="size-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{tr("ลิงก์ Canva รายบุคคล")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isOwner
              ? tr(
                  "แจกลิงก์ Canva ให้นักเรียนคนละลิงก์ เพื่อกันเด็กแก้/ลบงานเพื่อนกัน นักเรียนกดจากที่นี่เพื่อเข้า Canva ของตัวเอง",
                )
              : tr("เปิดลิงก์ Canva ของตัวเองที่ครูแจกให้ ไม่ต้องล็อกอินอีเมล")}
          </p>
        </div>
        {isOwner && (
          <SessionDialog classroomId={classroomId} members={members ?? []}>
            <Button size="sm">
              <Plus className="size-4" />
              {tr("เพิ่มชุดลิงก์")}
            </Button>
          </SessionDialog>
        )}
      </div>

      {sessions && sessions.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {tr("ยังไม่มีชุดลิงก์ Canva")}
        </div>
      )}

      {sessions?.map((s) => {
        const subs = assignmentsBySession(s.id);
        const mine = subs.find((a) => a.student_id === user?.id);
        return (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="flex items-start justify-between gap-3 text-lg">
                <span className="flex items-center gap-2 min-w-0">
                  <Palette className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{s.title}</span>
                </span>
                {isOwner && (
                  <span className="flex items-center gap-1 shrink-0">
                    <SessionDialog classroomId={classroomId} members={members ?? []} session={s}>
                      <Button size="icon" variant="ghost" title={tr("แก้ไข")}>
                        <Pencil className="size-4" />
                      </Button>
                    </SessionDialog>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={tr("ลบ")}
                      onClick={() => {
                        if (confirm(tr("ลบชุดลิงก์นี้?"))) deleteSession.mutate(s.id);
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {s.description && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {s.description}
                </p>
              )}

              {!isOwner && (
                <>
                  {mine ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        asChild
                        onClick={() => {
                          if (!mine.opened_at) markOpened.mutate(mine.id);
                        }}
                      >
                        <a href={mine.canva_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-4" />
                          {tr("เปิด Canva ของฉัน")}
                        </a>
                      </Button>
                      {mine.opened_at && (
                        <Badge variant="secondary">{tr("เปิดแล้ว")}</Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {tr("ครูยังไม่ได้แจกลิงก์ให้คุณในชุดนี้")}
                    </p>
                  )}
                </>
              )}

              {isOwner && (
                <div className="rounded-md border divide-y">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground flex items-center justify-between">
                    <span>
                      {tr("จำนวนลิงก์")}: {subs.length}
                    </span>
                    <span>
                      {tr("เปิดแล้ว")}: {subs.filter((a) => a.opened_at).length}
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {subs.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-muted-foreground">
                        {tr("ยังไม่มีลิงก์")}
                      </p>
                    ) : (
                      subs.map((a) => {
                        const m = (members ?? []).find((mm) => mm.id === a.student_id);
                        return (
                          <div
                            key={a.id}
                            className="flex items-center gap-2 px-3 py-2 text-sm"
                          >
                            <span className="flex-1 min-w-0 truncate">
                              {m?.display_name ?? a.student_id.slice(0, 8)}
                            </span>
                            {a.opened_at && (
                              <Badge variant="secondary" className="text-xs">
                                {tr("เปิดแล้ว")}
                              </Badge>
                            )}
                            <Button asChild size="sm" variant="ghost">
                              <a
                                href={a.canva_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate max-w-[200px]"
                                title={a.canva_url}
                              >
                                <ExternalLink className="size-3" />
                                {tr("เปิด")}
                              </a>
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SessionDialog({
  classroomId,
  members,
  session,
  children,
}: {
  classroomId: string;
  members: Member[];
  session?: SessionRow;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(session?.title ?? "");
  const [description, setDescription] = useState(session?.description ?? "");
  const [rows, setRows] = useState<{ student_id: string; canva_url: string }[]>([
    { student_id: "", canva_url: "" },
  ]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [loading, setLoading] = useState(false);

  // Load existing assignments when editing
  const editing = !!session;
  const { data: existingAssignments } = useQuery({
    queryKey: ["canva-session-edit", session?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canva_assignments")
        .select("id, student_id, canva_url")
        .eq("session_id", session!.id);
      if (error) throw error;
      return data;
    },
    enabled: open && editing,
  });

  // When dialog opens for edit, pre-fill
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setTitle(session?.title ?? "");
      setDescription(session?.description ?? "");
      if (editing && existingAssignments) {
        setRows(
          existingAssignments.length > 0
            ? existingAssignments.map((a) => ({
                student_id: a.student_id,
                canva_url: a.canva_url,
              }))
            : [{ student_id: "", canva_url: "" }],
        );
      } else if (!editing) {
        setRows([{ student_id: "", canva_url: "" }]);
      }
    }
  }

  // re-sync when existing loads
  if (
    open &&
    editing &&
    existingAssignments &&
    rows.length === 1 &&
    !rows[0].student_id &&
    !rows[0].canva_url &&
    existingAssignments.length > 0
  ) {
    setRows(
      existingAssignments.map((a) => ({ student_id: a.student_id, canva_url: a.canva_url })),
    );
  }

  function addRow() {
    setRows((r) => [...r, { student_id: "", canva_url: "" }]);
  }
  function removeRow(idx: number) {
    setRows((r) => (r.length === 1 ? r : r.filter((_, i) => i !== idx)));
  }
  function updateRow(idx: number, patch: Partial<{ student_id: string; canva_url: string }>) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function applyBulk() {
    const urls = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      toast.error(tr("ใส่ลิงก์อย่างน้อย 1 บรรทัด"));
      return;
    }
    // Auto-pair with members in order; keep existing student_ids from rows where set
    const newRows = urls.map((url, i) => ({
      student_id: members[i]?.id ?? "",
      canva_url: url,
    }));
    setRows(newRows);
    setBulkOpen(false);
    setBulkText("");
    toast.success(tr("วางลิงก์เรียบร้อย จับคู่ตามรายชื่อให้แล้ว"));
  }

  async function save() {
    if (!title.trim()) {
      toast.error(tr("ใส่ชื่อกิจกรรม"));
      return;
    }
    const valid = rows.filter((r) => r.student_id && r.canva_url.trim());
    if (valid.length === 0) {
      toast.error(tr("ใส่ลิงก์อย่างน้อย 1 รายการ"));
      return;
    }
    for (const r of valid) {
      if (!isValidCanvaUrl(r.canva_url)) {
        toast.error(tr("ลิงก์ต้องเป็น canva.com"));
        return;
      }
    }
    // Check duplicates of student_id
    const seen = new Set<string>();
    for (const r of valid) {
      if (seen.has(r.student_id)) {
        toast.error(tr("มีนักเรียนซ้ำ ตรวจสอบรายชื่ออีกครั้ง"));
        return;
      }
      seen.add(r.student_id);
    }

    setLoading(true);
    try {
      let sessionId: string;
      if (editing) {
        sessionId = session!.id;
        const { error: upErr } = await supabase
          .from("canva_sessions")
          .update({ title: title.trim(), description: description.trim() || null })
          .eq("id", sessionId);
        if (upErr) throw upErr;
        // Delete old assignments and re-insert (simpler than diff)
        await supabase.from("canva_assignments").delete().eq("session_id", sessionId);
      } else {
        const { data: created, error: insErr } = await supabase
          .from("canva_sessions")
          .insert({
            classroom_id: classroomId,
            title: title.trim(),
            description: description.trim() || null,
            created_by: user!.id,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        sessionId = created!.id;
      }

      const { error: aErr } = await supabase.from("canva_assignments").insert(
        valid.map((r) => ({
          session_id: sessionId,
          student_id: r.student_id,
          canva_url: r.canva_url.trim(),
        })),
      );
      if (aErr) throw aErr;

      toast.success(editing ? tr("บันทึกแล้ว") : tr("สร้างแล้ว"));
      qc.invalidateQueries({ queryKey: ["canva-sessions", classroomId] });
      qc.invalidateQueries({ queryKey: ["canva-assignments", classroomId] });
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? tr("แก้ไขชุดลิงก์ Canva") : tr("เพิ่มชุดลิงก์ Canva")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{tr("ชื่อกิจกรรม")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr("เช่น ใบงานบทที่ 3")}
            />
          </div>
          <div>
            <Label>{tr("รายละเอียด (ไม่บังคับ)")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>
              {tr("ลิงก์รายคน")} ({rows.length})
            </Label>
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" type="button">
                  {tr("วางลิงก์เป็นชุด")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{tr("วางลิงก์เป็นชุด")}</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  {tr(
                    "วางลิงก์ Canva บรรทัดละ 1 ลิงก์ ระบบจะจับคู่กับนักเรียนตามลำดับรายชื่อ",
                  )}
                </p>
                <Textarea
                  rows={8}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={"https://www.canva.com/design/xxxx/\nhttps://www.canva.com/design/yyyy/"}
                />
                <DialogFooter>
                  <Button onClick={applyBulk}>{tr("ใช้")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto rounded-md border p-2">
            {rows.map((row, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <Select
                  value={row.student_id}
                  onValueChange={(v) => updateRow(idx, { student_id: v })}
                >
                  <SelectTrigger className="w-44 shrink-0">
                    <SelectValue placeholder={tr("เลือกนักเรียน")} />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.display_name ?? m.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  placeholder="https://www.canva.com/design/..."
                  value={row.canva_url}
                  onChange={(e) => updateRow(idx, { canva_url: e.target.value })}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={rows.length === 1}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button size="sm" variant="outline" type="button" onClick={addRow}>
            <Plus className="size-4" />
            {tr("เพิ่มแถว")}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tr("ยกเลิก")}
          </Button>
          <Button onClick={save} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {tr("บันทึก")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
