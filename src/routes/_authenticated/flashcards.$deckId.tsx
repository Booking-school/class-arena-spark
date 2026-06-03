import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Brain,
  Flame,
  Plus,
  RotateCw,
  Sparkles,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/flashcards/$deckId")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: DeckPage,
});

type FlashcardRow = Pick<
  Database["public"]["Tables"]["flashcards"]["Row"],
  "id" | "front" | "back" | "idx"
>;
type Deck = Pick<
  Database["public"]["Tables"]["flashcard_decks"]["Row"],
  "id" | "title" | "description" | "owner_id"
>;
type GeneratedFlashcardItem = {
  front?: string;
  back?: string;
  question?: string;
  answer?: string;
  term?: string;
  definition?: string;
};
type GeneratedFlashcardsResponse = {
  cards?: GeneratedFlashcardItem[];
  questions?: GeneratedFlashcardItem[];
};
type FlashcardInsertRow = {
  deck_id: string;
  front: string;
  back: string;
  idx: number;
};
type FlashcardReviewRow = Pick<
  Database["public"]["Tables"]["flashcard_reviews"]["Row"],
  "card_id" | "ease" | "next_review_at" | "review_count"
>;

function DeckPage() {
  const { deckId } = Route.useParams();
  const { user } = useAuth();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<FlashcardRow[]>([]);
  const [reviews, setReviews] = useState<FlashcardReviewRow[]>([]);
  const [mode, setMode] = useState<"manage" | "study">("manage");
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  // study
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);

  async function load() {
    const [d, c] = await Promise.all([
      supabase
        .from("flashcard_decks")
        .select("id,title,description,owner_id")
        .eq("id", deckId)
        .maybeSingle(),
      supabase.from("flashcards").select("id,front,back,idx").eq("deck_id", deckId).order("idx"),
    ]);
    setDeck(d.data as Deck | null);
    const nextCards = (c.data ?? []) as FlashcardRow[];
    setCards(nextCards);
    if (user && nextCards.length > 0) {
      const { data: reviewData } = await supabase
        .from("flashcard_reviews")
        .select("card_id,ease,next_review_at,review_count")
        .eq("user_id", user.id)
        .in(
          "card_id",
          nextCards.map((card) => card.id),
        );
      setReviews((reviewData ?? []) as FlashcardReviewRow[]);
    } else {
      setReviews([]);
    }
  }
  useEffect(() => {
    load();
  }, [deckId, user?.id]);

  const isOwner = deck?.owner_id === user?.id;
  const reviewByCard = useMemo(
    () => new Map(reviews.map((review) => [review.card_id, review])),
    [reviews],
  );
  const now = Date.now();
  const studyCards = useMemo(
    () =>
      [...cards].sort((a, b) => {
        const aReview = reviewByCard.get(a.id);
        const bReview = reviewByCard.get(b.id);
        const aDue = !aReview || new Date(aReview.next_review_at).getTime() <= now;
        const bDue = !bReview || new Date(bReview.next_review_at).getTime() <= now;
        if (aDue !== bDue) return aDue ? -1 : 1;
        return a.idx - b.idx;
      }),
    [cards, now, reviewByCard],
  );
  const currentCard = studyCards[pos] ?? studyCards[0];
  const reviewedCount = reviews.length;
  const dueCount = cards.filter((card) => {
    const review = reviewByCard.get(card.id);
    return !review || new Date(review.next_review_at).getTime() <= now;
  }).length;
  const masteredCount = reviews.filter((review) => review.ease >= 3).length;
  const masteryPct = cards.length
    ? Math.round((reviewedCount / cards.length) * 60 + (masteredCount / cards.length) * 40)
    : 0;

  async function addCard() {
    if (!front.trim() || !back.trim()) return;
    const { error } = await supabase.from("flashcards").insert({
      deck_id: deckId,
      front: front.trim(),
      back: back.trim(),
      idx: cards.length,
    });
    if (error) return toast.error(error.message);
    setFront("");
    setBack("");
    setOpen(false);
    load();
  }

  async function delCard(id: string) {
    const { error } = await supabase.from("flashcards").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function aiGenerate() {
    const topic = prompt(tr("หัวข้อ/เนื้อหาที่จะสร้างบัตรคำ (เช่น คำศัพท์อังกฤษพื้นฐาน 10 คำ)"));
    if (!topic) return;
    toast.info(tr("กำลังสร้างด้วย AI…"));
    const { data, error } = await supabase.functions.invoke("generate-quest", {
      body: { topic, mode: "flashcards", count: 10 },
    });
    if (error) return toast.error(error.message);
    const generated = data as GeneratedFlashcardsResponse | null;
    const items = generated?.cards || generated?.questions || [];
    if (!items.length) return toast.error(tr("AI ไม่ได้ส่งบัตรคำกลับมา"));
    const rows = items
      .slice(0, 20)
      .map(
        (it, i): FlashcardInsertRow => ({
          deck_id: deckId,
          front: it.front || it.question || it.term || "",
          back: it.back || it.answer || it.definition || "",
          idx: cards.length + i,
        }),
      )
      .filter((r) => r.front && r.back);
    if (!rows.length) return toast.error(tr("ข้อมูลไม่สมบูรณ์"));
    const { error: e2 } = await supabase.from("flashcards").insert(rows);
    if (e2) return toast.error(e2.message);
    toast.success(`เพิ่ม ${rows.length} บัตรแล้ว`);
    load();
  }

  async function rate(ease: 1 | 2 | 3) {
    const card = currentCard;
    if (!card || !user) return;
    const days = ease === 1 ? 1 : ease === 2 ? 3 : 7;
    const next = new Date(Date.now() + days * 86400000).toISOString();
    const previousReview = reviewByCard.get(card.id);
    const nextReview: FlashcardReviewRow = {
      card_id: card.id,
      ease,
      next_review_at: next,
      review_count: (previousReview?.review_count ?? 0) + 1,
    };
    const { error } = await supabase.from("flashcard_reviews").upsert(
      {
        user_id: user.id,
        card_id: card.id,
        ease,
        next_review_at: next,
        last_reviewed_at: new Date().toISOString(),
        review_count: nextReview.review_count,
      },
      { onConflict: "user_id,card_id" },
    );
    if (error) return toast.error(error.message);
    setReviews((prev) => [...prev.filter((review) => review.card_id !== card.id), nextReview]);
    toast.success(
      ease === 3
        ? tr("บัตรนี้จำแม่นขึ้นแล้ว")
        : ease === 2
          ? tr("บันทึกรอบทบทวนถัดไปแล้ว")
          : tr("ตั้งให้กลับมาทบทวนพรุ่งนี้แล้ว"),
    );
    setFlipped(false);
    setPos((p) => (studyCards.length ? (p + 1) % studyCards.length : 0));
  }

  if (!deck) return <div className="p-6 text-muted-foreground">{tr("กำลังโหลด…")}</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/flashcards">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display">{deck.title}</h1>
            <p className="text-sm text-muted-foreground">{cards.length} บัตร</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={mode === "manage" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("manage")}
          >
            {tr("จัดการ")}
          </Button>
          <Button
            variant={mode === "study" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setMode("study");
              setPos(0);
              setFlipped(false);
            }}
            disabled={!cards.length}
          >
            {tr("ทบทวน")}
          </Button>
        </div>
      </div>

      <Card className="border-primary/25 bg-[linear-gradient(135deg,var(--card),color-mix(in_oklch,var(--accent)_22%,var(--card)))]">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary">
                <Brain className="size-5" />
              </div>
              <div>
                <p className="font-display text-lg">{tr("Deck mastery")}</p>
                <p className="text-sm text-muted-foreground">
                  {dueCount > 0
                    ? `${dueCount} ${tr("บัตรถึงรอบทบทวน")}`
                    : tr("ไม่มีบัตรค้างทบทวนในชุดนี้")}
                </p>
              </div>
            </div>
            <Progress value={masteryPct} className="h-2.5" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs md:min-w-72">
            <DeckPulse
              icon={<Target className="size-3.5" />}
              label={tr("บัตร")}
              value={cards.length}
            />
            <DeckPulse
              icon={<Flame className="size-3.5" />}
              label={tr("ถึงรอบ")}
              value={dueCount}
              hot
            />
            <DeckPulse
              icon={<Trophy className="size-3.5" />}
              label={tr("จำแม่น")}
              value={masteredCount}
            />
          </div>
        </CardContent>
      </Card>

      {mode === "manage" ? (
        <div className="space-y-3">
          {isOwner && (
            <div className="flex gap-2 flex-wrap">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="size-4" />
                    {tr("เพิ่มบัตร")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{tr("เพิ่มบัตรคำ")}</DialogTitle>
                    <DialogDescription>
                      {tr("ใส่คำถามด้านหน้าและคำตอบด้านหลังเพื่อเพิ่มเข้าชุดนี้")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="flashcard-front">{tr("หน้า (คำถาม)")}</Label>
                      <Textarea
                        id="flashcard-front"
                        value={front}
                        onChange={(e) => setFront(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="flashcard-back">{tr("หลัง (คำตอบ)")}</Label>
                      <Textarea
                        id="flashcard-back"
                        value={back}
                        onChange={(e) => setBack(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={addCard}>{tr("เพิ่ม")}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="outline" onClick={aiGenerate}>
                <Sparkles className="size-4" />
                {tr("สร้างด้วย AI")}
              </Button>
            </div>
          )}
          {cards.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {tr("ยังไม่มีบัตร")}
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {cards.map((c) => (
                <Card key={c.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="font-medium">{c.front}</div>
                    <div className="text-sm text-muted-foreground border-t pt-2">{c.back}</div>
                    {isOwner && (
                      <div className="flex justify-end">
                        <Button variant="ghost" size="icon" onClick={() => delCard(c.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>
              บัตรที่ {Math.min(pos + 1, studyCards.length)} / {studyCards.length}
            </span>
            {dueCount > 0 && (
              <Badge variant="outline" className="gap-1">
                <Flame className="size-3" />
                {dueCount} {tr("ถึงรอบ")}
              </Badge>
            )}
          </div>
          <Card
            className="min-h-[280px] cursor-pointer hover:border-primary/50"
            onClick={() => setFlipped((f) => !f)}
          >
            <CardContent className="p-10 grid place-items-center text-center min-h-[280px]">
              <div>
                <p className="text-xs text-muted-foreground mb-3">
                  {flipped ? tr("คำตอบ") : tr("คำถาม")}: {tr("คลิกเพื่อพลิก")}
                </p>
                <p className="text-2xl font-display">
                  {flipped ? currentCard?.back : currentCard?.front}
                </p>
              </div>
            </CardContent>
          </Card>
          {flipped ? (
            <div className="flex gap-2 justify-center">
              <Button variant="destructive" onClick={() => rate(1)}>
                {tr("ยาก (พรุ่งนี้)")}
              </Button>
              <Button variant="secondary" onClick={() => rate(2)}>
                {tr("พอใช้ (3 วัน)")}
              </Button>
              <Button onClick={() => rate(3)}>{tr("ง่าย (7 วัน)")}</Button>
            </div>
          ) : (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setFlipped(true)}>
                <RotateCw className="size-4" />
                {tr("พลิกบัตร")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeckPulse({
  icon,
  label,
  value,
  hot = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hot?: boolean;
}) {
  return (
    <div
      className={`rounded-md border bg-card/80 px-2.5 py-2 ${
        hot && value > 0 ? "border-primary/35 bg-primary/10" : ""
      }`}
    >
      <div className="flex items-center gap-1 text-muted-foreground">
        <span className={hot && value > 0 ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium mb-1 block">
      {children}
    </label>
  );
}
