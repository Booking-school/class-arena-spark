import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  GraduationCap,
  KeyRound,
  Loader2,
  Plus,
  Users,
} from "lucide-react";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/classrooms/")({ component: ClassroomsPage });

type ClassroomListItem = {
  id: string;
  name: string;
  owner_id: string;
  subject: string | null;
  description: string | null;
  grade_level: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ClassroomMemberRow = {
  classrooms: ClassroomListItem | ClassroomListItem[] | null;
};

function ClassroomsPage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const canCreate = hasRole("teacher") || hasRole("admin");
  const [openCreate, setOpenCreate] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", description: "" });
  const [joinCode, setJoinCode] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const CLASSROOM_COLS =
    "id, name, owner_id, subject, description, grade_level, created_at, updated_at";

  const { data: owned, isLoading: ownedLoading } = useQuery({
    queryKey: ["classrooms-owned", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classrooms")
        .select(CLASSROOM_COLS)
        .eq("owner_id", user!.id);
      if (error) throw error;
      return (data ?? []) as ClassroomListItem[];
    },
    enabled: !!user,
  });

  const { data: joined, isLoading: joinedLoading } = useQuery({
    queryKey: ["classrooms-joined", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classroom_members")
        .select(`classroom_id, classrooms(${CLASSROOM_COLS})`)
        .eq("user_id", user!.id);
      if (error) throw error;
      const rows = (data ?? []) as ClassroomMemberRow[];
      return rows
        .map((d) => (Array.isArray(d.classrooms) ? d.classrooms[0] : d.classrooms))
        .filter((classroom): classroom is ClassroomListItem => Boolean(classroom));
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error(tr("ใส่ชื่อห้อง"));
      const { error } = await supabase.from("classrooms").insert({
        owner_id: user!.id,
        name,
        subject: form.subject.trim() || null,
        description: form.description.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("สร้างห้องเรียนแล้ว"));
      setOpenCreate(false);
      setForm({ name: "", subject: "", description: "" });
      setCreateError(null);
      qc.invalidateQueries({ queryKey: ["classrooms-owned"] });
    },
    onError: (e: Error) => {
      setCreateError(e.message);
      toast.error(e.message);
    },
  });

  const join = useMutation({
    mutationFn: async () => {
      const code = joinCode.trim().toUpperCase();
      if (!code) throw new Error(tr("ใส่รหัส"));
      const { error } = await supabase.rpc("join_classroom_by_code", { _code: code });
      if (error)
        throw new Error(
          error.message === "classroom not found" ? tr("ไม่พบห้องที่มีรหัสนี้") : error.message,
        );
    },

    onSuccess: () => {
      toast.success(tr("เข้าร่วมห้องเรียนแล้ว"));
      setOpenJoin(false);
      setJoinCode("");
      setJoinError(null);
      qc.invalidateQueries({ queryKey: ["classrooms-joined"] });
    },
    onError: (e: Error) => {
      setJoinError(e.message);
      toast.error(e.message);
    },
  });

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10 space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <GraduationCap className="size-4" />
            {tr("Connected classroom")}
          </div>
          <h1 className="mt-3 text-4xl font-semibold">{tr("ห้องเรียน")}</h1>
          <p className="text-muted-foreground mt-1">
            {tr("จัดบทเรียน แจกโค้ดเข้าร่วม ส่งงาน และเช็กชื่อในที่เดียว")}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog
            open={openJoin}
            onOpenChange={(next) => {
              setOpenJoin(next);
              if (!next) setJoinError(null);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline">
                <KeyRound className="size-4" />
                {tr("เข้าร่วมห้อง")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{tr("เข้าร่วมห้องเรียน")}</DialogTitle>
              </DialogHeader>
              <div>
                <Label htmlFor="classroom-join-code">{tr("รหัสห้อง")}</Label>
                <Input
                  id="classroom-join-code"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value);
                    setJoinError(null);
                  }}
                  placeholder={tr("เช่น ABC123")}
                  aria-invalid={!!joinError}
                  aria-describedby={joinError ? "classroom-join-code-error" : undefined}
                />
                {joinError && <InlineError id="classroom-join-code-error" message={joinError} />}
              </div>
              <DialogFooter>
                <Button onClick={() => join.mutate()} disabled={join.isPending}>
                  {join.isPending && <Loader2 className="size-4 animate-spin" />}
                  {join.isPending ? tr("กำลังเข้าร่วม") : tr("เข้าร่วม")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {canCreate && (
            <Dialog
              open={openCreate}
              onOpenChange={(next) => {
                setOpenCreate(next);
                if (!next) setCreateError(null);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4 mr-1" />
                  {tr("สร้างห้อง")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{tr("สร้างห้องเรียน")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="classroom-name">{tr("ชื่อห้อง")}</Label>
                    <Input
                      id="classroom-name"
                      value={form.name}
                      onChange={(e) => {
                        setForm({ ...form, name: e.target.value });
                        setCreateError(null);
                      }}
                      aria-invalid={!!createError && !form.name.trim()}
                      aria-describedby={createError ? "classroom-create-error" : undefined}
                    />
                  </div>
                  <div>
                    <Label htmlFor="classroom-subject">{tr("วิชา")}</Label>
                    <Input
                      id="classroom-subject"
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="classroom-description">{tr("รายละเอียด")}</Label>
                    <Textarea
                      id="classroom-description"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                  {createError && <InlineError id="classroom-create-error" message={createError} />}
                </div>
                <DialogFooter>
                  <Button onClick={() => create.mutate()} disabled={create.isPending}>
                    {create.isPending && <Loader2 className="size-4 animate-spin" />}
                    {create.isPending ? tr("กำลังสร้าง") : tr("สร้าง")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <ClassroomSummary
          icon={<BookOpen className="size-5" />}
          label={tr("ห้องที่คุณสอน")}
          value={String(owned?.length ?? 0)}
          isLoading={ownedLoading}
        />
        <ClassroomSummary
          icon={<Users className="size-5" />}
          label={tr("ห้องที่เข้าร่วม")}
          value={String(joined?.length ?? 0)}
          isLoading={joinedLoading}
        />
      </div>

      {canCreate && (
        <section>
          <SectionTitle title={tr("ห้องของฉัน (สอน)")} count={owned?.length ?? 0} />
          <ClassroomGrid
            items={owned ?? []}
            isLoading={ownedLoading}
            showCode
            emptyTitle={tr("ยังไม่มีห้องที่คุณสอน")}
            emptyDescription={tr(
              "สร้างห้องเรียนแรกเพื่อแจกโค้ดเข้าร่วม จัดบทเรียน และเช็กชื่อได้จากที่เดียว",
            )}
          />
        </section>
      )}

      <section>
        <SectionTitle title={tr("ห้องที่เข้าร่วม")} count={joined?.length ?? 0} />
        <ClassroomGrid
          items={joined ?? []}
          isLoading={joinedLoading}
          emptyTitle={tr("ยังไม่ได้เข้าร่วมห้องเรียน")}
          emptyDescription={tr("ใช้รหัสจากครูเพื่อเข้าห้องเรียน ดูบทเรียน และทำเควสต์ของคุณ")}
        />
      </section>
    </div>
  );
}

function ClassroomSummary({
  icon,
  label,
  value,
  isLoading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-10" />
        ) : (
          <span className="text-2xl font-semibold">{value}</span>
        )}
      </div>
    </div>
  );
}

function InlineError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="mt-2 flex items-start gap-1.5 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <Badge variant="secondary">
        {count.toLocaleString()} {tr("ห้อง")}
      </Badge>
    </div>
  );
}

function ClassroomGrid({
  items,
  isLoading,
  showCode,
  emptyTitle,
  emptyDescription,
}: {
  items: ClassroomListItem[];
  isLoading: boolean;
  showCode?: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (isLoading) return <ClassroomGridSkeleton />;
  if (items.length === 0)
    return (
      <ClassroomEmptyState title={emptyTitle} description={emptyDescription} showCode={showCode} />
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c) => (
        <Link key={c.id} to="/classrooms/$id" params={{ id: c.id }} className="group">
          <Card className="h-full cursor-pointer transition-colors hover:border-primary/45 hover:bg-secondary/35">
            <CardHeader>
              <CardTitle className="flex items-start justify-between gap-3 text-lg">
                <span className="flex min-w-0 items-center gap-2">
                  <BookOpen className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{c.name}</span>
                </span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              {c.subject && (
                <Badge variant="secondary" className="mb-2">
                  {tr("วิชา")}: {c.subject}
                </Badge>
              )}
              {c.description && <p className="line-clamp-2">{c.description}</p>}
              {showCode && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 font-mono text-xs text-foreground">
                  <Users className="size-3.5 text-primary" />
                  <span className="font-sans text-muted-foreground">{tr("รหัสเข้าร่วม:")}</span>
                  <JoinCodeInline classroomId={c.id} />
                </p>
              )}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function ClassroomGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={tr("กำลังโหลดห้องเรียน")}>
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-2/3" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClassroomEmptyState({
  title,
  description,
  showCode,
}: {
  title: string;
  description: string;
  showCode?: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
          {showCode ? <BookOpen className="size-5" /> : <Users className="size-5" />}
        </div>
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function JoinCodeInline({ classroomId }: { classroomId: string }) {
  const { data } = useQuery({
    queryKey: ["classroom-join-code", classroomId],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_classroom_join_code", {
        _classroom_id: classroomId,
      });
      return (data as string | null) ?? null;
    },
  });
  return <span className="font-semibold text-foreground">{data ?? "—"}</span>;
}
