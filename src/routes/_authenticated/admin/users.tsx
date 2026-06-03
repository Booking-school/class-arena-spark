import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listAuthUsers, adminResetPassword, adminDeleteUser } from "@/lib/admin-users.functions";
import type { AppRole } from "@/hooks/use-auth";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/admin/users")({ component: AdminUsers });

const ROLES = ["admin", "teacher", "student", "guest"] as const satisfies readonly AppRole[];

function AdminUsers() {
  const { hasRole, loading } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listAuthUsers);
  const resetFn = useServerFn(adminResetPassword);
  const deleteFn = useServerFn(adminDeleteUser);
  const [pwInputs, setPwInputs] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users-full"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }, authRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("*"),
        listFn({}),
      ]);
      const authMap = new Map((authRes.users ?? []).map((u) => [u.id, u]));
      return (profiles ?? []).map((p) => {
        const a = authMap.get(p.id);
        return {
          ...p,
          email: a?.email ?? null,
          student_id: a?.student_id ?? null,
          last_sign_in_at: a?.last_sign_in_at ?? null,
          roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
        };
      });
    },
    enabled: hasRole("admin"),
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("อัปเดต role แล้ว"));
      qc.invalidateQueries({ queryKey: ["admin-users-full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPw = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      resetFn({ data: { userId, password } }),
    onSuccess: (_d, vars) => {
      toast.success(tr("รีเซ็ตรหัสผ่านแล้ว"));
      setPwInputs((s) => ({ ...s, [vars.userId]: "" }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delUser = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => {
      toast.success(tr("ลบบัญชีแล้ว"));
      qc.invalidateQueries({ queryKey: ["admin-users-full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" />;

  const rows = (data ?? []).filter((u) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (u.display_name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.student_id ?? "").toLowerCase().includes(q) ||
      u.roles.some((r: string) => r.toLowerCase().includes(q))
    );
  });

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10 space-y-6">
      <header>
        <h1 className="font-display text-4xl">{tr("จัดการผู้ใช้")}</h1>
        <p className="text-muted-foreground mt-1">
          {tr("ดูข้อมูลบัญชี รีเซ็ตรหัสผ่าน และกำหนด role")}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center justify-between gap-3">
            <span>
              ผู้ใช้ทั้งหมด ({rows.length}/{data?.length ?? 0})
            </span>
            <div className="w-full max-w-xs">
              <Label htmlFor="admin-user-search" className="sr-only">
                {tr("ค้นหาผู้ใช้")}
              </Label>
              <Input
                id="admin-user-search"
                placeholder={tr("ค้นหา ชื่อ / ID / email / role")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="font-normal"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-muted-foreground text-sm">{tr("กำลังโหลด…")}</p>}
          <div className="space-y-2">
            {rows.map((u) => (
              <div
                key={u.id}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-md border"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{u.display_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {u.student_id ? (
                      <>
                        ID: <span className="font-mono">{u.student_id}</span> •{" "}
                      </>
                    ) : null}
                    <span className="font-mono">{u.email ?? "—"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    XP {u.xp} • Gold {u.gold} • Lv {u.level}
                    {u.last_sign_in_at ? (
                      <> • last sign-in {new Date(u.last_sign_in_at).toLocaleString()}</>
                    ) : null}
                  </p>
                  <div className="flex gap-1 mt-1">
                    {u.roles.length === 0 && <Badge variant="secondary">no role</Badge>}
                    {u.roles.map((r: string) => (
                      <Badge key={r} variant="outline">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 lg:items-center">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      aria-label={`${tr("รหัสผ่านใหม่")} ${u.display_name ?? u.email ?? ""}`}
                      placeholder={tr("รหัสผ่านใหม่")}
                      value={pwInputs[u.id] ?? ""}
                      onChange={(e) => setPwInputs((s) => ({ ...s, [u.id]: e.target.value }))}
                      className="w-40 font-mono"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resetPw.isPending || (pwInputs[u.id]?.length ?? 0) < 6}
                      onClick={() =>
                        resetPw.mutate({ userId: u.id, password: pwInputs[u.id] ?? "" })
                      }
                    >
                      {tr("รีเซ็ต")}
                    </Button>
                  </div>
                  <Select
                    onValueChange={(v) => setRole.mutate({ userId: u.id, role: v as AppRole })}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder={tr("เปลี่ยน role")} />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(`${tr("ลบบัญชี")} ${u.display_name ?? u.email}?`))
                        delUser.mutate(u.id);
                    }}
                  >
                    {tr("ลบ")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
