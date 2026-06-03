import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { tr } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin/teachers")({
  component: AdminTeachers,
});

function AdminTeachers() {
  const { hasRole, loading } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["teacher-applications"],
    queryFn: async () => {
      const { data: apps, error } = await supabase
        .from("teacher_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (apps ?? []).map((a) => a.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      return (apps ?? []).map((a) => ({
        ...a,
        profile: profiles?.find((p) => p.id === a.user_id),
      }));
    },
    enabled: hasRole("admin"),
  });

  const approve = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("approve_teacher_application", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("อนุมัติเป็นครูเรียบร้อย"));
      qc.invalidateQueries({ queryKey: ["teacher-applications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("reject_teacher_application", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("ปฏิเสธคำขอแล้ว"));
      qc.invalidateQueries({ queryKey: ["teacher-applications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;

  const pending = data?.filter((a) => a.status === "pending") ?? [];
  const reviewed = data?.filter((a) => a.status !== "pending") ?? [];

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-10 space-y-6">
      <header>
        <h1 className="font-display text-4xl">{tr("อนุมัติบัญชีครู")}</h1>
        <p className="text-muted-foreground mt-1">{tr("ตรวจสอบและอนุมัติคำขอสมัครเป็นครู")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">
            {tr("รออนุมัติ")} ({pending.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-muted-foreground text-sm">{tr("กำลังโหลด…")}</p>}
          {!isLoading && pending.length === 0 && (
            <p className="text-muted-foreground text-sm">{tr("ไม่มีคำขอที่รออนุมัติ")}</p>
          )}
          {pending.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 p-3 rounded-md border"
            >
              <div>
                <p className="font-medium">{a.profile?.display_name ?? a.user_id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString("th-TH")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reject.mutate(a.user_id)}
                  disabled={reject.isPending}
                >
                  {tr("ปฏิเสธ")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => approve.mutate(a.user_id)}
                  disabled={approve.isPending}
                >
                  {tr("อนุมัติ")}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">
            {tr("ประวัติ")} ({reviewed.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {reviewed.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 p-3 rounded-md border"
            >
              <div>
                <p className="font-medium">{a.profile?.display_name ?? a.user_id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">
                  {a.reviewed_at ? new Date(a.reviewed_at).toLocaleString("th-TH") : "—"}
                </p>
              </div>
              <Badge variant={a.status === "approved" ? "default" : "secondary"}>{a.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
