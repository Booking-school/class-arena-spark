import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Send, Sparkles, Loader2 } from "lucide-react";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/ai-chat")({ component: AIChatPage });

type Msg = { role: "user" | "assistant"; content: string };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : tr("เกิดข้อผิดพลาด");
}

function AIChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: tr(
        "สวัสดีครับ ผมคือ Scholar Tutor ติวเตอร์ส่วนตัวของคุณ ผมจะตอบเฉพาะเนื้อหาที่ครูสอนเท่านั้นนะ มีเรื่องอะไรไม่เข้าใจถามมาได้เลย!",
      ),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: input };
    const next = [...messages, userMsg];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const url = `https://fkjazvlqfgycoauemopz.supabase.co/functions/v1/personal-tutor`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        if (res.status === 429) throw new Error(tr("ใช้บ่อยเกินไป รอสักครู่"));
        if (res.status === 402) throw new Error(tr("เครดิต AI หมด ติดต่อแอดมิน"));
        throw new Error(await res.text());
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const d = line.slice(6).trim();
          if (d === "[DONE]") continue;
          try {
            const j = JSON.parse(d);
            const delta = j.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              setMessages((m) => {
                const c = [...m];
                c[c.length - 1] = { role: "assistant", content: acc };
                return c;
              });
            }
          } catch {
            // Ignore malformed stream chunks and keep reading.
          }
        }
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
      setMessages((m) => m.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <header className="border-b px-6 py-4">
        <h1 className="font-display text-2xl flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          {tr("AI ผู้ช่วย")}
        </h1>
      </header>
      <div ref={scroll} className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <Card
                className={`max-w-[80%] px-4 py-3 ${m.role === "user" ? "bg-primary text-primary-foreground" : ""}`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {m.content || (loading && i === messages.length - 1 ? "..." : "")}
                </p>
              </Card>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t p-4">
        <div className="mx-auto max-w-3xl flex gap-2">
          <label htmlFor="ai-chat-input" className="sr-only">
            {tr("คำถามถึง AI ผู้ช่วย")}
          </label>
          <Textarea
            id="ai-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={tr("พิมพ์คำถาม...")}
            rows={2}
            className="resize-none"
          />
          <Button onClick={send} disabled={loading} size="lg">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
