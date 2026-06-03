import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, Flame, Gift, Check } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

import { tr } from "@/i18n";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type DailyBonusResult = { ok?: boolean; gold?: number; message?: string };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : tr("เกิดข้อผิดพลาด");
}

export function DailyBonusCard({ profile }: { profile?: ProfileRow | null }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const claimed = profile?.last_login_bonus_date === today;
  const streak = profile?.streak_days ?? 0;
  const bonus = 5 + Math.min(streak, 30) * 2;

  async function claim() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("claim_daily_bonus");
      if (error) throw error;
      const res = data as DailyBonusResult | null;
      if (res?.ok) toast.success(`รับโบนัส ${res.gold} ทอง! 🪙`);
      else toast.info(res?.message ?? tr("เคลมไปแล้ว"));
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-xl bg-primary/15 grid place-items-center">
            <Gift className="size-6 text-primary" />
          </div>
          <div>
            <p className="font-display text-lg">{tr("โบนัสประจำวัน")}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Flame className="size-3.5 text-orange-500" /> สตรีค {streak} วัน •
              <Coins className="size-3.5 text-amber-500" /> รับ {bonus} ทอง
            </p>
          </div>
        </div>
        <Button onClick={claim} disabled={claimed || loading} size="sm">
          {claimed ? (
            <>
              <Check className="size-4 mr-1" />
              {tr("รับแล้ววันนี้")}
            </>
          ) : (
            `รับ +${bonus}`
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
