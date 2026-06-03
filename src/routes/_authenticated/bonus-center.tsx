import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Crown,
  LineChart,
  Medal,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { tr } from "@/i18n";

export const Route = createFileRoute("/_authenticated/bonus-center")({
  component: BonusCenterPage,
});

type ClassroomRow = Pick<
  Database["public"]["Tables"]["classrooms"]["Row"],
  "id" | "name" | "subject" | "grade_level" | "owner_id"
>;
type ClassroomMemberWithClassroom = Pick<
  Database["public"]["Tables"]["classroom_members"]["Row"],
  "classroom_id"
> & {
  classrooms?: ClassroomRow | ClassroomRow[] | null;
};
type ClassroomScoreRow = Pick<
  Database["public"]["Tables"]["classroom_scores"]["Row"],
  "user_id" | "classroom_id" | "xp" | "quests_completed" | "streak_days" | "perfect_scores"
>;
type ProfileMiniRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "display_name" | "avatar_url" | "level"
>;
type WeeklyMissionRow = Pick<
  Database["public"]["Tables"]["weekly_missions"]["Row"],
  "id" | "classroom_id" | "title" | "status" | "week_start" | "week_end"
>;
type MissionProgressRow = Pick<
  Database["public"]["Tables"]["mission_progress"]["Row"],
  | "id"
  | "mission_id"
  | "user_id"
  | "status"
  | "participation_xp_awarded"
  | "quality_xp_awarded"
  | "ai_xp_awarded"
>;
type TermBonusRuleRow = Database["public"]["Tables"]["term_bonus_rules"]["Row"];
type BonusRuleState = {
  schemaReady: boolean;
  rules: TermBonusRuleRow[];
};
type WeeklyState = {
  schemaReady: boolean;
  mission: WeeklyMissionRow | null;
  progressRows: MissionProgressRow[];
};

const emptyBonusRuleState: BonusRuleState = { schemaReady: true, rules: [] };
const emptyWeeklyState: WeeklyState = { schemaReady: true, mission: null, progressRows: [] };

function BonusCenterPage() {
  const { user, roles } = useAuth();
  const primaryRole: "admin" | "teacher" | "student" = roles.includes("admin")
    ? "admin"
    : roles.includes("teacher")
      ? "teacher"
      : "student";
  const isStaff = primaryRole !== "student";
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const weekRange = useMemo(() => getCurrentWeekRange(), []);

  const { data: classrooms = [], isLoading: loadingClassrooms } = useQuery({
    queryKey: ["bonus-classrooms", user?.id, primaryRole],
    queryFn: async () => {
      if (!user) return [];
      if (primaryRole === "admin") {
        const { data, error } = await supabase
          .from("classrooms")
          .select("id,name,subject,grade_level,owner_id")
          .order("created_at", { ascending: false })
          .limit(24);
        if (error) throw error;
        return (data ?? []) as ClassroomRow[];
      }

      const [ownedResult, joinedResult] = await Promise.all([
        supabase
          .from("classrooms")
          .select("id,name,subject,grade_level,owner_id")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("classroom_members")
          .select("classroom_id,classrooms(id,name,subject,grade_level,owner_id)")
          .eq("user_id", user.id),
      ]);
      if (ownedResult.error) throw ownedResult.error;
      if (joinedResult.error) throw joinedResult.error;

      const merged = new Map<string, ClassroomRow>();
      for (const classroom of (ownedResult.data ?? []) as ClassroomRow[]) {
        merged.set(classroom.id, classroom);
      }
      for (const member of (joinedResult.data ?? []) as ClassroomMemberWithClassroom[]) {
        const relation = Array.isArray(member.classrooms)
          ? member.classrooms[0]
          : member.classrooms;
        if (relation?.id) merged.set(relation.id, relation);
      }
      return [...merged.values()];
    },
    enabled: !!user,
  });

  const currentClassroom = useMemo(
    () =>
      classrooms.find((classroom) => classroom.id === selectedClassroomId) ?? classrooms[0] ?? null,
    [classrooms, selectedClassroomId],
  );
  const currentClassroomId = currentClassroom?.id ?? null;

  const { data: scoreRows = [] } = useQuery({
    queryKey: ["bonus-classroom-scores", currentClassroomId],
    queryFn: async () => {
      if (!currentClassroomId) return [];
      const { data, error } = await supabase
        .from("classroom_scores")
        .select("user_id,classroom_id,xp,quests_completed,streak_days,perfect_scores")
        .eq("classroom_id", currentClassroomId);
      if (error) throw error;
      return (data ?? []) as ClassroomScoreRow[];
    },
    enabled: !!currentClassroomId,
  });
  const scoreUserIds = scoreRows.map((score) => score.user_id);

  const { data: profiles = [] } = useQuery({
    queryKey: ["bonus-score-profiles", scoreUserIds.join(",")],
    queryFn: async () => {
      if (scoreUserIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_url,level")
        .in("id", scoreUserIds);
      if (error) throw error;
      return (data ?? []) as ProfileMiniRow[];
    },
    enabled: scoreUserIds.length > 0,
  });

  const { data: bonusRuleState = emptyBonusRuleState } = useQuery({
    queryKey: ["bonus-term-rules", currentClassroomId],
    queryFn: async (): Promise<BonusRuleState> => {
      if (!currentClassroomId) return emptyBonusRuleState;
      const { data, error } = await supabase
        .from("term_bonus_rules")
        .select(
          "id,grade_level,classroom_id,name,rule_type,bonus_points,criteria_json,is_active,created_by,created_at,updated_at",
        )
        .eq("is_active", true)
        .or(`classroom_id.eq.${currentClassroomId},classroom_id.is.null`)
        .limit(8);
      if (error) return { schemaReady: false, rules: [] };
      return { schemaReady: true, rules: (data ?? []) as TermBonusRuleRow[] };
    },
    enabled: !!currentClassroomId,
  });

  const { data: weeklyState = emptyWeeklyState } = useQuery({
    queryKey: ["bonus-weekly-progress", currentClassroomId, weekRange.startIso, isStaff, user?.id],
    queryFn: async (): Promise<WeeklyState> => {
      if (!currentClassroomId || !user) return emptyWeeklyState;
      const { data: mission, error: missionError } = await supabase
        .from("weekly_missions")
        .select("id,classroom_id,title,status,week_start,week_end")
        .eq("classroom_id", currentClassroomId)
        .eq("week_start", weekRange.startIso)
        .maybeSingle();
      if (missionError) return { schemaReady: false, mission: null, progressRows: [] };
      if (!mission) return emptyWeeklyState;

      let progressQuery = supabase
        .from("mission_progress")
        .select(
          "id,mission_id,user_id,status,participation_xp_awarded,quality_xp_awarded,ai_xp_awarded",
        )
        .eq("mission_id", mission.id);
      if (!isStaff) progressQuery = progressQuery.eq("user_id", user.id);
      const { data: progressRows, error: progressError } = await progressQuery;
      if (progressError) return { schemaReady: false, mission, progressRows: [] };
      return {
        schemaReady: true,
        mission,
        progressRows: (progressRows ?? []) as MissionProgressRow[],
      };
    },
    enabled: !!currentClassroomId && !!user,
  });

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const leaderboard = [...scoreRows]
    .sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0))
    .map((score, index) => ({
      ...score,
      rank: index + 1,
      profile: profileById.get(score.user_id),
    }));
  const currentUserScore = scoreRows.find((score) => score.user_id === user?.id) ?? null;
  const currentRank = leaderboard.find((score) => score.user_id === user?.id)?.rank ?? null;
  const doneRows = weeklyState.progressRows.filter((row) =>
    ["submitted", "reviewed", "completed"].includes(row.status),
  ).length;
  const weeklyProgress = weeklyState.progressRows.length
    ? clampPct((doneRows / weeklyState.progressRows.length) * 100)
    : 0;
  const leaderboardRule = bonusRuleState.rules.find((rule) => rule.rule_type === "leaderboard");
  const milestoneRule = bonusRuleState.rules.find((rule) => rule.rule_type === "milestone");
  const helperRule = bonusRuleState.rules.find((rule) => rule.rule_type === "helper");
  const estimatedBonus =
    (currentRank && currentRank <= 3 ? (leaderboardRule?.bonus_points ?? 2) : 0) +
    (weeklyProgress >= 70 ? (milestoneRule?.bonus_points ?? 2) : 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6 lg:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <Badge variant="outline" className="mb-3 gap-1.5">
            <Trophy className="size-3.5" />
            Bonus Center
          </Badge>
          <h1 className="font-display text-3xl font-semibold md:text-4xl">
            {tr("คะแนนพิเศษท้ายเทอม")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">
            {tr(
              "รวมอันดับห้อง, คะแนนสัปดาห์ และ milestone ที่ช่วยให้เด็กไม่ได้ต้องชนะ leaderboard อย่างเดียว",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/weekly-missions">
              <CalendarCheck className="size-4" />
              {tr("ภารกิจสัปดาห์")}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/hall-of-fame">
              <Crown className="size-4" />
              {tr("ดูอันดับ")}
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{tr("เลือกห้อง")}</p>
              <p className="text-sm text-muted-foreground">
                {tr("ดูคะแนนพิเศษตามห้องหรือสายชั้นที่เชื่อมกับ leaderboard")}
              </p>
            </div>
            <Badge variant="secondary">
              {classrooms.length} {tr("ห้อง")}
            </Badge>
          </div>
          {loadingClassrooms ? (
            <p className="text-sm text-muted-foreground">{tr("กำลังโหลด…")}</p>
          ) : classrooms.length === 0 ? (
            <p className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
              {tr("ยังไม่พบห้องเรียนสำหรับดูคะแนนพิเศษ")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classrooms.map((classroom) => (
                <Button
                  key={classroom.id}
                  type="button"
                  variant={classroom.id === currentClassroom?.id ? "default" : "outline"}
                  onClick={() => setSelectedClassroomId(classroom.id)}
                >
                  {classroom.name}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BonusMetric
          icon={<Medal className="size-5" />}
          label={tr("คะแนนพิเศษคาดการณ์")}
          value={`${estimatedBonus} pts`}
          detail={tr("จากอันดับและ milestone")}
          tone="gold"
        />
        <BonusMetric
          icon={<Crown className="size-5" />}
          label={tr("อันดับในห้อง")}
          value={currentRank ? `#${currentRank}` : tr("ยังไม่มี")}
          detail={tr("อิง classroom_scores")}
          tone="gold"
        />
        <BonusMetric
          icon={<CalendarCheck className="size-5" />}
          label={tr("Weekly Mission")}
          value={`${weeklyProgress}%`}
          detail={weeklyState.mission?.title ?? tr("ยังไม่มีรอบนี้")}
        />
        <BonusMetric
          icon={<Zap className="size-5" />}
          label="XP"
          value={currentUserScore?.xp ?? 0}
          detail={`${currentUserScore?.quests_completed ?? 0} ${tr("เควสต์")}`}
          tone="xp"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle className="font-display flex items-center gap-2 text-xl">
                <LineChart className="size-5 text-primary" />
                {tr("Leaderboard ห้อง")}
              </CardTitle>
              <Badge variant="outline">{currentClassroom?.grade_level ?? tr("ไม่ระบุชั้น")}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {leaderboard.length > 0 ? (
              leaderboard
                .slice(0, 10)
                .map((score) => (
                  <LeaderboardLine
                    key={score.user_id}
                    rank={score.rank}
                    name={score.profile?.display_name ?? tr("นักเรียน")}
                    level={score.profile?.level ?? 1}
                    xp={score.xp ?? 0}
                    quests={score.quests_completed ?? 0}
                    active={score.user_id === user?.id}
                  />
                ))
            ) : (
              <p className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                {tr(
                  "ยังไม่มีคะแนนในห้องนี้ เมื่อเด็กเริ่มทำ quest หรือครู sync งาน คะแนนจะแสดงตรงนี้",
                )}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2 text-xl">
              <ShieldCheck className="size-5 text-primary" />
              {tr("กติกาและ milestone")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <MilestoneLine
              icon={<Crown className="size-4" />}
              title={tr("Top 3 leaderboard")}
              detail={tr("ใช้เป็นรางวัลปลายเทอม แต่ไม่ให้เป็นทางเดียวในการได้คะแนนพิเศษ")}
              points={leaderboardRule?.bonus_points ?? 2}
              complete={!!currentRank && currentRank <= 3}
            />
            <MilestoneLine
              icon={<CheckCircle2 className="size-4" />}
              title={tr("Weekly Mission 70%")}
              detail={tr("ทำ checklist ให้ครบตามสัดส่วน งานหลักและ AI quest นับรวมกัน")}
              points={milestoneRule?.bonus_points ?? 2}
              complete={weeklyProgress >= 70}
            />
            <MilestoneLine
              icon={<Users className="size-4" />}
              title={tr("Helper mark")}
              detail={tr("ครูบันทึกจากงานทีมและการช่วยเพื่อน เหมาะกับเด็กที่ไม่ติดอันดับ")}
              points={helperRule?.bonus_points ?? 1}
              complete={false}
            />

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{tr("Weekly progress")}</p>
                <Badge variant="outline">
                  {doneRows}/{weeklyState.progressRows.length || 3}
                </Badge>
              </div>
              <Progress value={weeklyProgress} className="mt-3 h-2.5" />
              <p className="mt-2 text-sm text-muted-foreground">
                {weeklyState.mission
                  ? `${formatDate(weeklyState.mission.week_start)} - ${formatDate(
                      weeklyState.mission.week_end,
                    )}`
                  : tr("รอครูสร้างภารกิจสัปดาห์")}
              </p>
            </div>

            {bonusRuleState.rules.length > 0 ? (
              bonusRuleState.rules.map((rule) => (
                <RuleLine
                  key={rule.id}
                  name={rule.name}
                  type={rule.rule_type}
                  points={rule.bonus_points}
                  detail={describeCriteria(rule.criteria_json)}
                />
              ))
            ) : (
              <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                {tr("ยังไม่มีกติกาจริง ระบบใช้ค่าตั้งต้น: leaderboard 2, milestone 2, helper 1")}
              </p>
            )}
            {!bonusRuleState.schemaReady && (
              <p className="text-xs text-muted-foreground">
                {tr("รอ apply migration term_bonus_rules ก่อนแสดงกติกาจริง")}
              </p>
            )}
            {!weeklyState.schemaReady && (
              <p className="text-xs text-muted-foreground">
                {tr(
                  "รอ apply migration weekly_missions และ mission_progress ก่อนแสดง progress จริง",
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium">{tr("ใช้คู่กับภารกิจสัปดาห์")}</p>
            <p className="text-sm text-muted-foreground">
              {tr("เมื่อครู sync progress คะแนนพิเศษจะมีหลักฐานชัดขึ้นก่อนปิดท้ายเทอม")}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/weekly-missions">
              {tr("กลับไปจัด mission")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function BonusMetric({
  icon,
  label,
  value,
  detail,
  tone = "primary",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
  tone?: "primary" | "gold" | "xp";
}) {
  const toneClass =
    tone === "gold"
      ? "bg-[color-mix(in_oklch,var(--gold)_13%,var(--card))] text-[color:var(--gold)]"
      : tone === "xp"
        ? "bg-[color-mix(in_oklch,var(--xp)_13%,var(--card))] text-[color:var(--xp)]"
        : "bg-primary/10 text-primary";
  const iconMotionClass = tone === "xp" ? "scholar-progress-ring" : "";
  return (
    <Card className={tone === "gold" ? "scholar-metric scholar-reward-cue" : "scholar-metric"}>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`grid size-11 shrink-0 place-items-center rounded-md ${toneClass} ${iconMotionClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LeaderboardLine({
  rank,
  name,
  level,
  xp,
  quests,
  active,
}: {
  rank: number;
  name: string;
  level: number;
  xp: number;
  quests: number;
  active: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
        active ? "border-primary/40 bg-primary/10" : "bg-card"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-sm font-semibold">
          #{rank}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            Lv {level} · {quests} {tr("เควสต์")}
          </p>
        </div>
      </div>
      <Badge
        variant={rank <= 3 ? "default" : "outline"}
        className={rank <= 3 ? "scholar-reward-cue" : undefined}
      >
        {xp} XP
      </Badge>
    </div>
  );
}

function MilestoneLine({
  icon,
  title,
  detail,
  points,
  complete,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  points: number;
  complete: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-md ${
            points > 1
              ? "bg-[color-mix(in_oklch,var(--gold)_12%,var(--card))] text-[color:var(--gold)]"
              : "bg-primary/10 text-primary"
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{title}</p>
            <div className="flex items-center gap-2">
              <Badge variant={complete ? "default" : "outline"}>
                {complete ? tr("ผ่าน") : tr("กำลังเก็บ")}
              </Badge>
              <Badge className="scholar-reward-cue">{points} pts</Badge>
            </div>
          </div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function RuleLine({
  name,
  type,
  points,
  detail,
}: {
  name: string;
  type: string;
  points: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Badge variant="outline">{type}</Badge>
          <Badge>{points} pts</Badge>
        </div>
      </div>
    </div>
  );
}

function getCurrentWeekRange(reference = new Date()) {
  const start = new Date(reference);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
  };
}

function describeCriteria(criteria: Json) {
  if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) {
    return tr("ดูรายละเอียดกติกาจากครู");
  }
  const entries = Object.entries(criteria)
    .filter(([, value]) => value !== null && value !== undefined)
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return entries.length > 0 ? entries.join(", ") : tr("ดูรายละเอียดกติกาจากครู");
}

function clampPct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
  }).format(new Date(value));
}
