import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Trophy, Play, ChevronRight, Check, X, Crown, Medal, Zap, Loader2 } from "lucide-react";
import type { Database, Json } from "@/integrations/supabase/types";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/quiz/$sessionId")({
  component: QuizPlayPage,
});

type QuizSessionRow = Database["public"]["Tables"]["quiz_sessions"]["Row"];
type QuizParticipantRow = Database["public"]["Tables"]["quiz_participants"]["Row"];
type QuizQuestionRow = Database["public"]["Views"]["quiz_questions_safe"]["Row"];
type SubmitQuizResult = { is_correct?: boolean; score?: number };
type NextQuizResult = { finished?: boolean };

type LobbyProps = {
  session: QuizSessionRow;
  participants: QuizParticipantRow[];
  isHost: boolean;
};

type PlayingProps = {
  session: QuizSessionRow;
  question: QuizQuestionRow;
  totalQuestions: number;
  isHost: boolean;
  userId: string;
};

type FinishedProps = {
  participants: QuizParticipantRow[];
  isHost: boolean;
  sessionId: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : tr("เกิดข้อผิดพลาด");
}

function jsonArrayToStrings(value: Json | null) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

const OPTION_COLORS = [
  "bg-red-500 hover:bg-red-600 border-red-600",
  "bg-blue-500 hover:bg-blue-600 border-blue-600",
  "bg-amber-500 hover:bg-amber-600 border-amber-600",
  "bg-green-500 hover:bg-green-600 border-green-600",
];
const OPTION_SHAPES = ["▲", "◆", "●", "■"];

function QuizPlayPage() {
  const { sessionId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ["quiz-session", sessionId],
    queryFn: async () =>
      (await supabase.from("quiz_sessions").select("*").eq("id", sessionId).single()).data,
  });
  const { data: questions } = useQuery({
    queryKey: ["quiz-questions", sessionId],
    queryFn: async () =>
      (
        await supabase
          .from("quiz_questions_safe")
          .select("*")
          .eq("session_id", sessionId)
          .order("idx")
      ).data ?? [],
  });
  const { data: participants, refetch: refetchPart } = useQuery({
    queryKey: ["quiz-participants", sessionId],
    queryFn: async () =>
      (
        await supabase
          .from("quiz_participants")
          .select("*")
          .eq("session_id", sessionId)
          .order("total_score", { ascending: false })
      ).data ?? [],
  });

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel("quiz-" + sessionId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quiz_sessions", filter: `id=eq.${sessionId}` },
        () => refetchSession(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "quiz_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        () => refetchPart(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "quiz_answers",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["quiz-answers", sessionId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [sessionId, refetchSession, refetchPart, qc]);

  if (!session)
    return (
      <div className="p-10 text-center">
        <Loader2 className="animate-spin mx-auto" />
      </div>
    );

  const isHost = session.host_id === user?.id;
  const currentQ = questions?.[session.current_question_idx];

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Live Quiz</p>
          <h1 className="font-display text-3xl">{session.title}</h1>
        </div>
        <Badge variant="outline" className="text-base font-mono px-3 py-1">
          {session.join_code}
        </Badge>
      </header>

      {session.status === "lobby" && (
        <Lobby session={session} participants={participants ?? []} isHost={isHost} />
      )}
      {(session.status === "active" || session.status === "question_revealed") && currentQ && (
        <Playing
          session={session}
          question={currentQ}
          totalQuestions={questions?.length ?? 0}
          isHost={isHost}
          userId={user!.id}
        />
      )}
      {session.status === "finished" && (
        <Finished participants={participants ?? []} isHost={isHost} sessionId={sessionId} />
      )}
    </div>
  );
}

function Lobby({ session, participants, isHost }: LobbyProps) {
  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/quiz/join?code=${session.join_code}`
      : "";
  async function start() {
    const { error } = await supabase.rpc("start_quiz_session", { _session_id: session.id });
    if (error) toast.error(error.message);
  }
  return (
    <div className="grid gap-6 md:grid-cols-[1fr,1fr]">
      <Card className="bg-gradient-to-br from-primary/10 to-transparent">
        <CardHeader>
          <CardTitle>{tr("เชิญเข้าร่วม")}</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="bg-white p-4 rounded-xl inline-block">
            <QRCodeSVG value={joinUrl} size={180} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{tr("หรือใช้รหัส")}</p>
            <p className="font-mono text-5xl font-bold tracking-widest">{session.join_code}</p>
            <p className="text-xs text-muted-foreground mt-1">{tr("เข้าที่ /quiz/join")}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{tr("ผู้เข้าร่วม")}</span>
            <Badge>{participants.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {participants.length === 0 && (
            <p className="text-sm text-muted-foreground">{tr("รอผู้เล่นเข้าร่วม...")}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {participants.map((p) => (
              <div key={p.id} className="px-3 py-2 rounded-md bg-muted/50 text-sm truncate">
                {p.display_name}
              </div>
            ))}
          </div>
          {isHost && (
            <Button
              className="w-full mt-4"
              size="lg"
              onClick={start}
              disabled={participants.length === 0}
            >
              <Play className="size-4 mr-2" /> เริ่มควิซ
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Playing({ session, question, totalQuestions, isHost }: PlayingProps) {
  const [answered, setAnswered] = useState<number | null>(null);
  const [result, setResult] = useState<{ correct: boolean; score: number } | null>(null);
  const questionId = question.id ?? "";
  const questionIndex = question.idx ?? 0;
  const startedAt = useMemo(
    () => new Date(session.question_started_at ?? Date.now()).getTime(),
    [session.question_started_at],
  );
  const limitMs = (question.time_limit_seconds ?? 20) * 1000;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setAnswered(null);
    setResult(null);
  }, [questionId]);

  const remaining = Math.max(0, limitMs - (now - startedAt));
  const pct = (remaining / limitMs) * 100;
  const timeUp = remaining === 0;
  const revealed = session.status === "question_revealed" || timeUp;

  const { data: answers } = useQuery({
    queryKey: ["quiz-answers", session.id, questionId],
    queryFn: async () =>
      (
        await supabase
          .from("quiz_answers")
          .select("answer_idx, is_correct, user_id")
          .eq("question_id", questionId)
      ).data ?? [],
    refetchInterval: 1500,
    enabled: !!questionId,
  });

  async function pick(idx: number) {
    if (answered !== null || timeUp || isHost) return;
    if (!questionId) return;
    setAnswered(idx);
    try {
      const { data, error } = await supabase.rpc("submit_quiz_answer", {
        _question_id: questionId,
        _answer_idx: idx,
      });
      if (error) throw error;
      const r = data as SubmitQuizResult | null;
      setResult({ correct: Boolean(r?.is_correct), score: r?.score ?? 0 });
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
      setAnswered(null);
    }
  }

  async function reveal() {
    await supabase.rpc("reveal_quiz_question", { _session_id: session.id });
  }
  async function next() {
    const { data, error } = await supabase.rpc("next_quiz_question", { _session_id: session.id });
    if (error) toast.error(error.message);
    if ((data as NextQuizResult | null)?.finished) {
      await supabase.rpc("finish_quiz_session", { _session_id: session.id });
    }
  }

  const options = jsonArrayToStrings(question.options);
  const counts = options.map((_, i) => answers?.filter((a) => a.answer_idx === i).length ?? 0);
  const totalAnswered = answers?.length ?? 0;
  const maxCount = Math.max(1, ...counts);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="outline">
          ข้อ {questionIndex + 1} / {totalQuestions}
        </Badge>
        <Badge variant="secondary" className="font-mono">
          {Math.ceil(remaining / 1000)}s
        </Badge>
      </div>
      <Progress value={pct} className="h-2" />

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-center">{question.question}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {options.map((opt, i) => {
              const isMine = answered === i;
              const isCorrect = revealed && i === question.correct_idx;
              const isWrongPick = revealed && isMine && i !== question.correct_idx;
              const heightStyle = isHost ? { height: `${40 + (counts[i] / maxCount) * 80}px` } : {};
              return (
                <button
                  key={i}
                  onClick={() => pick(i)}
                  disabled={isHost || answered !== null || timeUp}
                  style={heightStyle}
                  className={`relative text-white font-medium text-lg p-4 rounded-xl border border-white/20 transition-all flex items-center gap-3
                    ${OPTION_COLORS[i % 4]}
                    ${answered !== null && !isMine ? "opacity-50" : ""}
                    ${isMine ? "ring-4 ring-offset-2 ring-primary" : ""}
                    ${isCorrect ? "ring-4 ring-offset-2 ring-green-400" : ""}
                    ${isWrongPick ? "opacity-60" : ""}
                    disabled:cursor-not-allowed`}
                >
                  <span className="text-2xl">{OPTION_SHAPES[i % 4]}</span>
                  <span className="flex-1 text-left">{opt}</span>
                  {isHost && (
                    <Badge variant="secondary" className="text-foreground">
                      {counts[i]}
                    </Badge>
                  )}
                  {isCorrect && <Check className="size-6" />}
                  {isWrongPick && <X className="size-6" />}
                </button>
              );
            })}
          </div>

          {!isHost && result && (
            <div
              className={`mt-4 p-4 rounded-xl text-center ${result.correct ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}
            >
              <p className="font-bold text-xl">
                {result.correct
                  ? `🎉 ${tr("ถูกต้อง")}! +${result.score} ${tr("คะแนน")}`
                  : `❌ ${tr("ผิด")}`}
              </p>
            </div>
          )}
          {!isHost && answered === null && timeUp && (
            <p className="text-center mt-4 text-sm text-muted-foreground">{tr("หมดเวลา")}</p>
          )}

          {isHost && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {tr("ตอบแล้ว")}: {totalAnswered}
              </p>
              <div className="flex gap-2">
                {!revealed && (
                  <Button variant="outline" onClick={reveal}>
                    {tr("เฉลย")}
                  </Button>
                )}
                <Button onClick={next}>
                  {questionIndex + 1 === totalQuestions ? (
                    tr("จบควิซ")
                  ) : (
                    <>
                      {tr("ข้อถัดไป")}
                      <ChevronRight className="size-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Finished({ participants }: FinishedProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Trophy className="size-16 mx-auto text-amber-500" />
        <h2 className="font-display text-3xl">{tr("ผลควิซ")}</h2>
      </div>
      <Card>
        <CardContent className="p-4 space-y-2">
          {participants.map((p, i) => {
            const icon =
              i === 0 ? (
                <Crown className="size-5 text-amber-500" />
              ) : i === 1 ? (
                <Medal className="size-5 text-slate-400" />
              ) : i === 2 ? (
                <Medal className="size-5 text-orange-400" />
              ) : (
                <span className="w-5 text-center text-muted-foreground">{i + 1}</span>
              );
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between p-3 rounded-lg ${i < 3 ? "bg-gradient-to-r from-primary/10 to-transparent" : "bg-muted/30"}`}
              >
                <div className="flex items-center gap-3">
                  {icon}
                  <span className="font-medium">{p.display_name}</span>
                </div>
                <Badge variant="outline" className="gap-1">
                  <Zap className="size-3" />
                  {p.total_score}
                </Badge>
              </div>
            );
          })}
          {participants.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">
              {tr("ไม่มีผู้เข้าร่วม")}
            </p>
          )}
        </CardContent>
      </Card>
      <Button variant="outline" asChild className="w-full">
        <Link to="/dashboard">{tr("กลับ Dashboard")}</Link>
      </Button>
    </div>
  );
}
