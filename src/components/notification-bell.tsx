import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

import { tr } from "@/i18n";
type Notif = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  type: string;
};

export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as Notif[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  const markAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const deleteOne = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").delete().eq("id", id);
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["notifications", user?.id] });
      const prev = qc.getQueryData<Notif[]>(["notifications", user?.id]);
      qc.setQueryData<Notif[]>(["notifications", user?.id], (old) =>
        (old ?? []).filter((n) => n.id !== id),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications", user?.id], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const deleteAll = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await supabase.from("notifications").delete().eq("user_id", user.id);
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications", user?.id] });
      const prev = qc.getQueryData<Notif[]>(["notifications", user?.id]);
      qc.setQueryData<Notif[]>(["notifications", user?.id], []);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications", user?.id], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const unread = items.filter((n) => !n.is_read).length;

  // เปิด popover แล้ว mark ว่าอ่านทั้งหมดอัตโนมัติ (badge หายทันที)
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && unread > 0) markAll.mutate();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold grid place-items-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-medium">{tr("การแจ้งเตือน")}</span>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => markAll.mutate()}
              >
                <CheckCheck className="size-3 mr-1" />
                อ่านทั้งหมด
              </Button>
            )}
            {items.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive"
                onClick={() => deleteAll.mutate()}
              >
                <Trash2 className="size-3 mr-1" />
                ลบทั้งหมด
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-[420px]">
          {items.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              {tr("ยังไม่มีการแจ้งเตือน")}
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`group relative px-3 py-2.5 hover:bg-accent/40 transition-colors ${!n.is_read ? "bg-accent/20" : ""}`}
                >
                  <div
                    className="flex items-start gap-2 cursor-pointer pr-7"
                    onClick={() => {
                      if (!n.is_read) markOne.mutate(n.id);
                      if (n.link) {
                        setOpen(false);
                        navigate({ to: n.link });
                      }
                    }}
                  >
                    {!n.is_read && (
                      <span className="mt-1.5 size-2 rounded-full bg-primary shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(n.created_at).toLocaleString("th-TH")}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="ลบ"
                    className="absolute top-2 right-2 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteOne.mutate(n.id);
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
