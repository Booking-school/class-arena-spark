import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Brain, Flame, Layers, Plus, Target, Trash2, Trophy, Zap } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

import { tr } from "@/i18n";
export const Route = createFileRoute("/_authenticated/flashcards/")({
  component: FlashcardsPage,
});

type Deck = {
  id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  owner_id: string;
  classroom_id: string | null;
  card_count?: number;
  due_count?: number;
  mastered_count?: number;
  mastery_pct?: number;
  reviewed_count?: number;
};
type DeckQueryRow = Omit<
  Deck,
  "card_count" | "due_count" | "mastered_count" | "mastery_pct" | "reviewed_count"
>;
type FlashcardLiteRow = Pick<Database["public"]["Tables"]["flashcards"]["Row"], "id" | "deck_id">;
type FlashcardReviewLiteRow = Pick<
  Database["public"]["Tables"]["flashcard_reviews"]["Row"],
  "card_id" | "ease" | "next_review_at" | "review_count"
>;

function FlashcardsPage() {
  const { user } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("flashcard_decks")
      .select("id,title,description,is_public,owner_id,classroom_id")
      .order("created_at", { ascending: false });
    const deckRows = (data ?? []) as DeckQueryRow[];
    const deckIds = deckRows.map((d) => d.id);
    const { data: cardData } = deckIds.length
      ? await supabase.from("flashcards").select("id,deck_id").in("deck_id", deckIds)
      : { data: [] as FlashcardLiteRow[] };
    const cardRows = (cardData ?? []) as FlashcardLiteRow[];
    const cardIds = cardRows.map((c) => c.id);
    const { data: reviewData } =
      user && cardIds.length
        ? await supabase
            .from("flashcard_reviews")
            .select("card_id,ease,next_review_at,review_count")
            .eq("user_id", user.id)
            .in("card_id", cardIds)
        : { data: [] as FlashcardReviewLiteRow[] };
    const reviewRows = (reviewData ?? []) as FlashcardReviewLiteRow[];
    const cardsByDeck = new Map<string, FlashcardLiteRow[]>();
    for (const card of cardRows) {
      cardsByDeck.set(card.deck_id, [...(cardsByDeck.get(card.deck_id) ?? []), card]);
    }
    const reviewByCard = new Map(reviewRows.map((review) => [review.card_id, review]));
    const now = Date.now();
    setDecks(
      deckRows.map((deck) => {
        const deckCards = cardsByDeck.get(deck.id) ?? [];
        const reviews = deckCards
          .map((card) => reviewByCard.get(card.id))
          .filter((review): review is FlashcardReviewLiteRow => !!review);
        const reviewedCount = reviews.length;
        const dueReviewed = reviews.filter(
          (review) => new Date(review.next_review_at).getTime() <= now,
        ).length;
        const dueCount = Math.max(0, deckCards.length - reviewedCount) + dueReviewed;
        const masteredCount = reviews.filter((review) => review.ease >= 3).length;
        const masteryPct = deckCards.length
          ? Math.round(
              (reviewedCount / deckCards.length) * 60 + (masteredCount / deckCards.length) * 40,
            )
          : 0;
        return {
          ...deck,
          card_count: deckCards.length,
          due_count: dueCount,
          mastered_count: masteredCount,
          mastery_pct: masteryPct,
          reviewed_count: reviewedCount,
        };
      }),
    );
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [user?.id]);

  async function createDeck() {
    if (!title.trim() || !user) return;
    const { error } = await supabase.from("flashcard_decks").insert({
      owner_id: user.id,
      title: title.trim(),
      description: desc.trim() || null,
      is_public: isPublic,
    });
    if (error) return toast.error(error.message);
    toast.success(tr("สร้างชุดบัตรคำเรียบร้อย"));
    setOpen(false);
    setTitle("");
    setDesc("");
    setIsPublic(false);
    load();
  }

  async function deleteDeck(id: string) {
    if (!confirm(tr("ลบชุดบัตรคำนี้?"))) return;
    const { error } = await supabase.from("flashcard_decks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(tr("ลบแล้ว"));
    load();
  }

  const totalCards = decks.reduce((sum, deck) => sum + (deck.card_count ?? 0), 0);
  const dueToday = decks.reduce((sum, deck) => sum + (deck.due_count ?? 0), 0);
  const masteredCards = decks.reduce((sum, deck) => sum + (deck.mastered_count ?? 0), 0);
  const averageMastery = decks.length
    ? Math.round(decks.reduce((sum, deck) => sum + (deck.mastery_pct ?? 0), 0) / decks.length)
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display flex items-center gap-2">
            <Layers className="size-6" />
            {tr("บัตรคำศัพท์")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr("ทบทวนก่อนเจอครูครั้งหน้า พลิกหน้า-หลังเพื่อเก็บคำสำคัญของรอบสัปดาห์")}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              {tr("สร้างชุดใหม่")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("สร้างชุดบัตรคำ")}</DialogTitle>
              <DialogDescription>
                {tr("ตั้งชื่อชุดบัตรคำและกำหนดว่าจะให้ผู้ใช้คนอื่นเห็นได้หรือไม่")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="flashcard-title">{tr("ชื่อชุด")}</Label>
                <Input
                  id="flashcard-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tr("เช่น คำศัพท์อังกฤษ บทที่ 1")}
                />
              </div>
              <div>
                <Label htmlFor="flashcard-description">{tr("คำอธิบาย (ไม่บังคับ)")}</Label>
                <Textarea
                  id="flashcard-description"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="flashcard-public">{tr("เผยแพร่สาธารณะ")}</Label>
                  <p className="text-xs text-muted-foreground">{tr("ทุกคนในระบบดูได้")}</p>
                </div>
                <Switch id="flashcard-public" checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createDeck}>{tr("สร้าง")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden border-primary/25 bg-[linear-gradient(135deg,var(--card),color-mix(in_oklch,var(--accent)_24%,var(--card)))]">
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[1.1fr_1.4fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-lg bg-primary/10 text-primary">
                <Brain className="size-6" />
              </div>
              <div>
                <h2 className="font-display text-xl">{tr("Flashcard Training")}</h2>
                <p className="text-sm text-muted-foreground">
                  {dueToday > 0
                    ? tr("มีบัตรถึงรอบทบทวนแล้ว เลือกชุดที่มีไฟก่อนคาบถัดไป")
                    : tr("ยังไม่มีบัตรค้างทบทวน รอบนี้เหมาะกับการเพิ่มชุดใหม่")}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{tr("Mastery เฉลี่ย")}</span>
                <span className="font-semibold">{averageMastery}%</span>
              </div>
              <Progress value={averageMastery} className="h-2.5" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <FlashcardPulseStat
              icon={<Layers className="size-4" />}
              label={tr("ชุด")}
              value={decks.length}
            />
            <FlashcardPulseStat
              icon={<Target className="size-4" />}
              label={tr("บัตร")}
              value={totalCards}
            />
            <FlashcardPulseStat
              icon={<Flame className="size-4" />}
              label={tr("ถึงรอบ")}
              value={dueToday}
              hot
            />
            <FlashcardPulseStat
              icon={<Trophy className="size-4" />}
              label={tr("จำแม่น")}
              value={masteredCards}
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground text-sm">{tr("กำลังโหลด…")}</p>
      ) : decks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {tr("ยังไม่มีชุดบัตรคำ สร้างชุดแรกของคุณ")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((d) => (
            <Card key={d.id} className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{d.title}</CardTitle>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {(d.due_count ?? 0) > 0 && (
                      <Badge className="gap-1">
                        <Flame className="size-3" />
                        {d.due_count}
                      </Badge>
                    )}
                    {d.is_public && <Badge variant="secondary">{tr("สาธารณะ")}</Badge>}
                  </div>
                </div>
                <CardDescription className="line-clamp-2">{d.description || "—"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{tr("Deck mastery")}</span>
                    <span className="font-semibold">{d.mastery_pct ?? 0}%</span>
                  </div>
                  <Progress value={d.mastery_pct ?? 0} className="h-2" />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {d.card_count} {tr("บัตร")}
                    </span>
                    <span>•</span>
                    <span>
                      {d.reviewed_count ?? 0} {tr("เคยทบทวน")}
                    </span>
                    <span>•</span>
                    <span>
                      {d.mastered_count ?? 0} {tr("จำแม่น")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={(d.due_count ?? 0) > 0 ? "default" : "outline"} className="gap-1">
                    {(d.due_count ?? 0) > 0 ? (
                      <Zap className="size-3" />
                    ) : (
                      <Target className="size-3" />
                    )}
                    {(d.due_count ?? 0) > 0 ? tr("พร้อมทบทวน") : tr("ไม่มีค้าง")}
                  </Badge>
                  <div className="flex gap-2">
                    {d.owner_id === user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteDeck(d.id)}
                        aria-label={tr("ลบชุดบัตรคำ")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                    <Button asChild size="sm">
                      <Link to="/flashcards/$deckId" params={{ deckId: d.id }}>
                        {(d.card_count ?? 0) > 0 ? tr("ทบทวน") : tr("เปิด")}
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FlashcardPulseStat({
  icon,
  label,
  value,
  hot = false,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hot?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-card/80 p-3 ${
        hot && value > 0 ? "border-primary/35 bg-primary/10" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={hot && value > 0 ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}
