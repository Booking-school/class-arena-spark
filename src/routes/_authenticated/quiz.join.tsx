import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/quiz/join")({
  validateSearch: (s: Record<string, unknown>) => ({ code: (s.code as string) ?? "" }),
  component: JoinPage,
});

type JoinQuizResult = { session_id?: string };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : tr("เกิดข้อผิดพลาด");
}

function JoinPage() {
  const nav = useNavigate();
  const { code: initial } = Route.useSearch();
  const [code, setCode] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("join_quiz_by_code", { _code: code.trim() });
      if (error) throw error;
      const sid = (data as JoinQuizResult | null)?.session_id;
      if (!sid) throw new Error(tr("ไม่พบห้องควิซจากรหัสนี้"));
      toast.success(tr("เข้าร่วมสำเร็จ"));
      nav({ to: "/quiz/$sessionId", params: { sessionId: sid } });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6 lg:p-10">
      <Card>
        <CardHeader className="text-center">
          <Sparkles className="size-10 mx-auto text-primary" />
          <CardTitle className="font-display text-2xl">{tr("เข้าร่วม Live Quiz")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={join} className="space-y-4">
            <Label htmlFor="quiz-code" className="sr-only">
              {tr("รหัส Live Quiz")}
            </Label>
            <Input
              id="quiz-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="text-center text-3xl font-mono tracking-widest h-16"
              autoFocus
            />
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading || code.length < 6}
            >
              เข้าร่วม
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
