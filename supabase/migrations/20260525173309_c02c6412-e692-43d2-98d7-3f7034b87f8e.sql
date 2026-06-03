
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.flashcard_decks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  classroom_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.flashcards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id UUID NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  idx INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.flashcard_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  card_id UUID NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  ease INTEGER NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_count INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, card_id)
);

CREATE INDEX idx_flashcards_deck ON public.flashcards(deck_id, idx);
CREATE INDEX idx_freviews_user ON public.flashcard_reviews(user_id, next_review_at);

ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decks read" ON public.flashcard_decks FOR SELECT TO authenticated
USING (
  is_public OR owner_id = auth.uid()
  OR (classroom_id IS NOT NULL AND (is_classroom_owner(classroom_id, auth.uid()) OR is_classroom_member(classroom_id, auth.uid())))
  OR has_role(auth.uid(), 'admin')
);
CREATE POLICY "decks insert own" ON public.flashcard_decks FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());
CREATE POLICY "decks update own" ON public.flashcard_decks FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "decks delete own" ON public.flashcard_decks FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "cards read" ON public.flashcards FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.flashcard_decks d WHERE d.id = flashcards.deck_id AND (
  d.is_public OR d.owner_id = auth.uid()
  OR (d.classroom_id IS NOT NULL AND (is_classroom_owner(d.classroom_id, auth.uid()) OR is_classroom_member(d.classroom_id, auth.uid())))
  OR has_role(auth.uid(), 'admin')
)));
CREATE POLICY "cards owner insert" ON public.flashcards FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.flashcard_decks d WHERE d.id = deck_id AND (d.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))));
CREATE POLICY "cards owner update" ON public.flashcards FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.flashcard_decks d WHERE d.id = deck_id AND (d.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))));
CREATE POLICY "cards owner delete" ON public.flashcards FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.flashcard_decks d WHERE d.id = deck_id AND (d.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

CREATE POLICY "reviews own all" ON public.flashcard_reviews FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_decks_updated BEFORE UPDATE ON public.flashcard_decks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
