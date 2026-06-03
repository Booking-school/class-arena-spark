import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Comment = {
  id: string;
  author_id: string;
  content: string;
  is_edited: boolean;
  created_at: string;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
};

export function AssignmentComments({
  assignmentId,
  classroomOwnerId,
}: {
  assignmentId: string;
  classroomOwnerId?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["assignment-comments", assignmentId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_comments")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
      if (authorIds.length === 0) return [] as Comment[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", authorIds);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profiles: map.get(r.author_id) ?? null })) as Comment[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("พิมพ์ข้อความก่อน");
      const { error } = await supabase.from("assignment_comments").insert({
        assignment_id: assignmentId,
        author_id: user!.id,
        content: trimmed,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["assignment-comments", assignmentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assignment_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignment-comments", assignmentId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setOpen(true)}>
        <MessageSquare className="size-3.5 mr-1" />
        ความคิดเห็น
      </Button>
    );
  }

  return (
    <div className="border-t pt-3 mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">ความคิดเห็น ({comments.length})</p>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setOpen(false)}>
          ซ่อน
        </Button>
      </div>
      {comments.length === 0 && (
        <p className="text-xs text-muted-foreground italic">ยังไม่มีความคิดเห็น</p>
      )}
      <ul className="space-y-2 max-h-64 overflow-y-auto">
        {comments.map((c) => {
          const canDelete = c.author_id === user?.id || classroomOwnerId === user?.id;
          return (
            <li key={c.id} className="rounded-md bg-muted/40 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium">
                    {c.profiles?.display_name ?? c.author_id.slice(0, 8)}
                    <span className="text-muted-foreground font-normal ml-2">
                      {new Date(c.created_at).toLocaleString("th-TH")}
                      {c.is_edited && " · (แก้ไขแล้ว)"}
                    </span>
                  </p>
                  <p className="text-sm whitespace-pre-wrap mt-0.5">{c.content}</p>
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    onClick={() => del.mutate(c.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ถามครูหรือเพื่อนเกี่ยวกับงานนี้…"
          rows={2}
          className="text-sm"
        />
        <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
