import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, Trophy, BookOpen, TrendingUp } from "lucide-react";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

type Classroom = { id: string; name: string };
type StudentRow = {
  user_id: string;
  display_name: string;
  xp: number;
  level: number;
  gold: number;
  quests_completed: number;
  streak_days: number;
  attendance_rate: number;
  assignments_done: number;
  assignments_total: number;
  avg_score: number | null;
};

function AnalyticsPage() {
  const { roles, user } = useAuth();
  const canView = roles.includes("teacher") || roles.includes("admin");
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const q = supabase.from("classrooms").select("id,name").order("name");
      if (!roles.includes("admin")) q.eq("owner_id", user.id);
      const { data } = await q;
      setClassrooms(data ?? []);
      if (data && data.length && !selectedId) setSelectedId(data[0].id);
    })();
  }, [user, roles]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    (async () => {
      // members
      const { data: members } = await supabase
        .from("classroom_members")
        .select("user_id")
        .eq("classroom_id", selectedId);
      const ids = (members ?? []).map((m) => m.user_id);
      if (!ids.length) {
        setRows([]);
        setLoading(false);
        return;
      }

      const [profilesRes, sessionsRes, attendanceRes, assignmentsRes, submissionsRes] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id,display_name,xp,level,gold,quests_completed,streak_days")
            .in("id", ids),
          supabase.from("attendance_sessions").select("id").eq("classroom_id", selectedId),
          supabase.from("attendance_records").select("user_id,session_id,status"),
          supabase.from("assignments").select("id").eq("classroom_id", selectedId),
          supabase.from("submissions").select("user_id,assignment_id,score"),
        ]);

      const profiles = profilesRes.data ?? [];
      const sessionIds = new Set((sessionsRes.data ?? []).map((s) => s.id));
      const assignmentIds = new Set((assignmentsRes.data ?? []).map((a) => a.id));
      const totalSessions = sessionIds.size;
      const totalAssignments = assignmentIds.size;

      const attMap = new Map<string, number>();
      (attendanceRes.data ?? []).forEach((r) => {
        if (sessionIds.has(r.session_id) && (r.status === "present" || r.status === "late")) {
          attMap.set(r.user_id, (attMap.get(r.user_id) ?? 0) + 1);
        }
      });

      const subMap = new Map<string, { count: number; scores: number[] }>();
      (submissionsRes.data ?? []).forEach((s) => {
        if (!assignmentIds.has(s.assignment_id)) return;
        const cur = subMap.get(s.user_id) ?? { count: 0, scores: [] };
        cur.count += 1;
        if (s.score != null) cur.scores.push(s.score);
        subMap.set(s.user_id, cur);
      });

      const built: StudentRow[] = profiles.map((p) => {
        const sub = subMap.get(p.id) ?? { count: 0, scores: [] };
        const avg = sub.scores.length
          ? sub.scores.reduce((a, b) => a + b, 0) / sub.scores.length
          : null;
        return {
          user_id: p.id,
          display_name: p.display_name ?? tr("ไม่ระบุชื่อ"),
          xp: p.xp,
          level: p.level,
          gold: p.gold,
          quests_completed: p.quests_completed,
          streak_days: p.streak_days,
          attendance_rate: totalSessions
            ? Math.round(((attMap.get(p.id) ?? 0) / totalSessions) * 100)
            : 0,
          assignments_done: sub.count,
          assignments_total: totalAssignments,
          avg_score: avg,
        };
      });
      built.sort((a, b) => b.xp - a.xp);
      setRows(built);
      setLoading(false);
    })();
  }, [selectedId]);

  const stats = useMemo(() => {
    if (!rows.length) return null;
    return {
      students: rows.length,
      avgXp: Math.round(rows.reduce((a, r) => a + r.xp, 0) / rows.length),
      avgAttendance: Math.round(rows.reduce((a, r) => a + r.attendance_rate, 0) / rows.length),
      avgScore: (() => {
        const s = rows.filter((r) => r.avg_score != null);
        return s.length
          ? Math.round(s.reduce((a, r) => a + (r.avg_score ?? 0), 0) / s.length)
          : null;
      })(),
    };
  }, [rows]);

  if (!canView) {
    return <div className="p-6 text-muted-foreground">{tr("เฉพาะครู/แอดมินเท่านั้น")}</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display flex items-center gap-2">
            <BarChart3 className="size-6" />
            {tr("ภาพรวมห้องเรียน")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr("ติดตามความก้าวหน้าของนักเรียนแบบรายห้อง")}
          </p>
        </div>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder={tr("เลือกห้องเรียน")} />
          </SelectTrigger>
          <SelectContent>
            {classrooms.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<Users className="size-4" />}
            label={tr("นักเรียน")}
            value={stats.students.toString()}
          />
          <StatCard
            icon={<Trophy className="size-4" />}
            label={tr("XP เฉลี่ย")}
            value={stats.avgXp.toLocaleString()}
          />
          <StatCard
            icon={<TrendingUp className="size-4" />}
            label={tr("เข้าเรียนเฉลี่ย")}
            value={`${stats.avgAttendance}%`}
          />
          <StatCard
            icon={<BookOpen className="size-4" />}
            label={tr("คะแนนเฉลี่ย")}
            value={stats.avgScore != null ? `${stats.avgScore}` : "—"}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{tr("นักเรียนทั้งหมด")}</CardTitle>
          <CardDescription>{tr("เรียงตาม XP สูงสุด")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{tr("กำลังโหลด…")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("ยังไม่มีนักเรียนในห้องนี้")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr("นักเรียน")}</TableHead>
                    <TableHead>Lv</TableHead>
                    <TableHead>XP</TableHead>
                    <TableHead>{tr("เควสต์")}</TableHead>
                    <TableHead>Streak</TableHead>
                    <TableHead className="min-w-[140px]">{tr("เข้าเรียน")}</TableHead>
                    <TableHead className="min-w-[140px]">{tr("งานที่ส่ง")}</TableHead>
                    <TableHead>{tr("คะแนนเฉลี่ย")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.user_id}>
                      <TableCell className="font-medium">{r.display_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Lv {r.level}</Badge>
                      </TableCell>
                      <TableCell>{r.xp.toLocaleString()}</TableCell>
                      <TableCell>{r.quests_completed}</TableCell>
                      <TableCell>{r.streak_days}🔥</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={r.attendance_rate} className="h-2 w-20" />
                          <span className="text-xs text-muted-foreground">
                            {r.attendance_rate}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={
                              r.assignments_total
                                ? (r.assignments_done / r.assignments_total) * 100
                                : 0
                            }
                            className="h-2 w-20"
                          />
                          <span className="text-xs text-muted-foreground">
                            {r.assignments_done}/{r.assignments_total}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{r.avg_score != null ? Math.round(r.avg_score) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-display">{value}</div>
      </CardContent>
    </Card>
  );
}
