import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown, Zap, Flame, Trophy, Medal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { tr } from "@/i18n";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/hall-of-fame")({ component: HallOfFame });

type ClassroomScoreRow = Pick<
  Database["public"]["Tables"]["classroom_scores"]["Row"],
  "user_id" | "xp" | "quests_completed" | "streak_days" | "perfect_scores"
>;
type ProfileLeaderboardRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "display_name" | "avatar_url" | "level"
>;
type LeaderboardRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  xp: number;
  quests_completed: number;
  streak_days: number;
  perfect_scores: number;
};
type LeaderboardSortKey = "xp" | "quests_completed" | "streak_days" | "perfect_scores";

function HallOfFame() {
  const [classroomId, setClassroomId] = useState<string>("all");

  const { data: classrooms } = useQuery({
    queryKey: ["hof-classrooms"],
    queryFn: async () =>
      (await supabase.from("classrooms").select("id, name").order("name")).data ?? [],
  });

  // ห้องเฉพาะ: ดึงจาก classroom_scores (ครูเป็นผู้ตั้ง)
  const { data: scores, refetch: refetchScores } = useQuery({
    queryKey: ["hof-scores", classroomId],
    enabled: classroomId !== "all",
    queryFn: async () => {
      const { data } = await supabase
        .from("classroom_scores")
        .select("*")
        .eq("classroom_id", classroomId);
      return data ?? [];
    },
  });

  // รวมทุกห้อง: aggregate จาก classroom_scores ทุกห้อง (ให้ตรงกับการ์ด "ดาวเด่นในห้องเรียน")
  const { data: allScores, refetch: refetchProfiles } = useQuery({
    queryKey: ["hof-all-scores"],
    enabled: classroomId === "all",
    queryFn: async () => {
      const { data: scores } = await supabase
        .from("classroom_scores")
        .select("user_id, xp, quests_completed, streak_days, perfect_scores");
      const agg = new Map<
        string,
        { xp: number; quests_completed: number; streak_days: number; perfect_scores: number }
      >();
      ((scores ?? []) as ClassroomScoreRow[]).forEach((s) => {
        const cur = agg.get(s.user_id) ?? {
          xp: 0,
          quests_completed: 0,
          streak_days: 0,
          perfect_scores: 0,
        };
        agg.set(s.user_id, {
          xp: cur.xp + (s.xp ?? 0),
          quests_completed: cur.quests_completed + (s.quests_completed ?? 0),
          streak_days: Math.max(cur.streak_days, s.streak_days ?? 0),
          perfect_scores: cur.perfect_scores + (s.perfect_scores ?? 0),
        });
      });
      const ids = Array.from(agg.keys());
      if (ids.length === 0) return [] as LeaderboardRow[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, level")
        .in("id", ids);
      const pmap = new Map(((profs ?? []) as ProfileLeaderboardRow[]).map((p) => [p.id, p]));
      return ids.map((uid) => {
        const a = agg.get(uid)!;
        const p = pmap.get(uid);
        return {
          user_id: uid,
          display_name: p?.display_name ?? "Anonymous",
          avatar_url: p?.avatar_url ?? null,
          level: p?.level ?? 1,
          xp: a.xp,
          quests_completed: a.quests_completed,
          streak_days: a.streak_days,
          perfect_scores: a.perfect_scores,
        };
      });
    },
  });

  const userIds = useMemo(
    () => Array.from(new Set(((scores ?? []) as ClassroomScoreRow[]).map((s) => s.user_id))),
    [scores],
  );

  const { data: profiles } = useQuery({
    queryKey: ["hof-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () =>
      (
        await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, level")
          .in("id", userIds)
      ).data ?? [],
  });

  // Realtime: subscribe ทั้ง classroom_scores และ profiles
  useEffect(() => {
    const ch = supabase
      .channel("lb-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "classroom_scores" }, () => {
        refetchScores();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        refetchProfiles();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refetchScores, refetchProfiles]);

  const profMap = new Map(((profiles ?? []) as ProfileLeaderboardRow[]).map((p) => [p.id, p]));

  const aggregated = useMemo(() => {
    if (classroomId === "all") {
      return allScores ?? [];
    }
    return ((scores ?? []) as ClassroomScoreRow[]).map((s): LeaderboardRow => {
      const p = profMap.get(s.user_id);
      return {
        user_id: s.user_id,
        xp: s.xp ?? 0,
        quests_completed: s.quests_completed ?? 0,
        streak_days: s.streak_days ?? 0,
        perfect_scores: s.perfect_scores ?? 0,
        display_name: p?.display_name ?? "Anonymous",
        avatar_url: p?.avatar_url ?? null,
        level: p?.level ?? 1,
      };
    });
  }, [classroomId, allScores, scores, profMap]);

  function rankStyle(i: number) {
    if (i === 0) return "from-yellow-400/30 to-yellow-100/10 border-yellow-500/50";
    if (i === 1) return "from-slate-300/30 to-slate-100/10 border-slate-400/50";
    if (i === 2) return "from-orange-400/30 to-orange-100/10 border-orange-500/50";
    return "";
  }

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10 space-y-6">
      <header className="text-center space-y-2">
        <Crown className="size-12 mx-auto text-primary" />
        <h1 className="font-display text-5xl">Hall of Fame</h1>
        <p className="text-muted-foreground">
          {classroomId === "all"
            ? tr("คะแนนรวมจากโปรไฟล์ (อัปเดตเรียลไทม์เมื่อทำเควสต์/ได้ XP)")
            : tr("คะแนนจากห้องเรียน ครูเป็นผู้กำหนด")}
        </p>
      </header>

      <div className="flex justify-center">
        <Select value={classroomId} onValueChange={setClassroomId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("รวมทุกห้องเรียน")}</SelectItem>
            {classrooms?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="xp">
        <TabsList>
          <TabsTrigger value="xp">
            <Zap className="size-4 mr-1" />
            XP
          </TabsTrigger>
          <TabsTrigger value="quests">
            <Trophy className="size-4 mr-1" />
            {tr("เควสต์")}
          </TabsTrigger>
          <TabsTrigger value="streak">
            <Flame className="size-4 mr-1" />
            {tr("สตรีค")}
          </TabsTrigger>
          <TabsTrigger value="perfect">
            <Medal className="size-4 mr-1" />
            Perfect
          </TabsTrigger>
        </TabsList>
        {(["xp", "quests", "streak", "perfect"] as const).map((key) => {
          const sortKey: LeaderboardSortKey =
            key === "xp"
              ? "xp"
              : key === "quests"
                ? "quests_completed"
                : key === "streak"
                  ? "streak_days"
                  : "perfect_scores";
          const sorted = [...aggregated]
            .sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0))
            .slice(0, 50);
          return (
            <TabsContent key={key} value={key} className="space-y-2 mt-4">
              {sorted.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-10">
                  {tr("ยังไม่มีคะแนน")}
                </p>
              )}
              {sorted.map((p, i) => (
                <Card key={p.user_id} className={`bg-gradient-to-r ${rankStyle(i)}`}>
                  <CardContent className="pt-4 flex items-center gap-4">
                    <div className="text-2xl font-display w-10 text-center">{i + 1}</div>
                    <Avatar>
                      <AvatarImage src={p.avatar_url ?? undefined} />
                      <AvatarFallback>{p.display_name?.[0] ?? "?"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.display_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-xl">{p[sortKey] ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Lv.{p.level}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
