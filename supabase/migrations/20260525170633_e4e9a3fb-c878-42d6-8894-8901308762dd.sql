
-- 1. Add last_login_bonus_date to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_bonus_date date;

-- 2. Seed titles (idempotent)
INSERT INTO public.titles (code, name, description) VALUES
  ('novice', 'ผู้เริ่มต้น', 'เริ่มต้นเส้นทางการเรียนรู้'),
  ('scholar', 'นักปราชญ์', 'ถึงระดับ 10'),
  ('legend', 'ตำนาน', 'ทำเควสต์ครบ 50 ข้อ'),
  ('streaker', 'นักสะสมไฟ', 'สตรีค 30 วัน'),
  ('perfectionist', 'ผู้สมบูรณ์แบบ', 'Perfect 5 ครั้ง'),
  ('sage', 'จอมปราชญ์', 'ถึงระดับ 25')
ON CONFLICT (code) DO NOTHING;

-- 3. Link existing achievements to titles (award title on unlock)
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS grants_title_code text;
UPDATE public.achievements SET grants_title_code = 'scholar' WHERE code = 'level_10' AND grants_title_code IS NULL;
UPDATE public.achievements SET grants_title_code = 'legend' WHERE code = 'quest_50' AND grants_title_code IS NULL;
UPDATE public.achievements SET grants_title_code = 'streaker' WHERE code = 'streak_30' AND grants_title_code IS NULL;
UPDATE public.achievements SET grants_title_code = 'perfectionist' WHERE code = 'perfect_5' AND grants_title_code IS NULL;
UPDATE public.achievements SET grants_title_code = 'sage' WHERE code = 'level_25' AND grants_title_code IS NULL;
UPDATE public.achievements SET grants_title_code = 'novice' WHERE code = 'first_quest' AND grants_title_code IS NULL;

-- 4. Function: check & award achievements for a user
CREATE OR REPLACE FUNCTION public.check_and_award_achievements(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  a record;
  player_value int;
  title_uuid uuid;
BEGIN
  SELECT level, xp, quests_completed, streak_days, perfect_scores INTO p
  FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN; END IF;

  FOR a IN SELECT * FROM public.achievements LOOP
    -- skip if already unlocked
    IF EXISTS (SELECT 1 FROM public.user_achievements WHERE user_id = _user_id AND achievement_id = a.id) THEN
      CONTINUE;
    END IF;

    player_value := CASE a.criteria_type
      WHEN 'level' THEN p.level
      WHEN 'xp' THEN p.xp
      WHEN 'quests' THEN p.quests_completed
      WHEN 'streak' THEN p.streak_days
      WHEN 'perfect' THEN p.perfect_scores
      ELSE 0
    END;

    IF player_value >= a.criteria_value THEN
      INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (_user_id, a.id);
      -- bonus
      UPDATE public.profiles
        SET xp = xp + a.xp_bonus, gold = gold + a.gold_bonus
        WHERE id = _user_id;
      -- grant title
      IF a.grants_title_code IS NOT NULL THEN
        SELECT id INTO title_uuid FROM public.titles WHERE code = a.grants_title_code;
        IF title_uuid IS NOT NULL THEN
          INSERT INTO public.user_titles (user_id, title_id) VALUES (_user_id, title_uuid)
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
      -- notification
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (_user_id, '🏆 ปลดล็อก: ' || a.name,
        COALESCE(a.description, '') || ' (+'||a.xp_bonus||' XP, +'||a.gold_bonus||' ทอง)',
        'achievement', '/achievements');
    END IF;
  END LOOP;
END;
$$;

-- 5. Trigger on profiles update
CREATE OR REPLACE FUNCTION public.trg_profiles_check_achievements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.xp IS DISTINCT FROM OLD.xp)
     OR (NEW.level IS DISTINCT FROM OLD.level)
     OR (NEW.quests_completed IS DISTINCT FROM OLD.quests_completed)
     OR (NEW.streak_days IS DISTINCT FROM OLD.streak_days)
     OR (NEW.perfect_scores IS DISTINCT FROM OLD.perfect_scores) THEN
    PERFORM public.check_and_award_achievements(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_check_achievements ON public.profiles;
CREATE TRIGGER profiles_check_achievements
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_profiles_check_achievements();

-- 6. Shop tables
CREATE TABLE IF NOT EXISTS public.shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'title', -- 'title' | 'cosmetic'
  gold_price int NOT NULL CHECK (gold_price >= 0),
  title_id uuid REFERENCES public.titles(id) ON DELETE SET NULL,
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop read all" ON public.shop_items;
CREATE POLICY "shop read all" ON public.shop_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "shop admin manage" ON public.shop_items;
CREATE POLICY "shop admin manage" ON public.shop_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.shop_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  gold_spent int NOT NULL,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);
ALTER TABLE public.shop_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchases own read" ON public.shop_purchases;
CREATE POLICY "purchases own read" ON public.shop_purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 7. Purchase RPC
CREATE OR REPLACE FUNCTION public.purchase_shop_item(_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
  current_gold int;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO item FROM public.shop_items WHERE id = _item_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบไอเทม'; END IF;
  IF EXISTS (SELECT 1 FROM public.shop_purchases WHERE user_id = uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'คุณซื้อไอเทมนี้ไปแล้ว';
  END IF;
  SELECT gold INTO current_gold FROM public.profiles WHERE id = uid;
  IF current_gold < item.gold_price THEN RAISE EXCEPTION 'ทองไม่พอ'; END IF;

  UPDATE public.profiles SET gold = gold - item.gold_price WHERE id = uid;
  INSERT INTO public.shop_purchases (user_id, item_id, gold_spent) VALUES (uid, _item_id, item.gold_price);
  IF item.title_id IS NOT NULL THEN
    INSERT INTO public.user_titles (user_id, title_id) VALUES (uid, item.title_id) ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (uid, '🛒 ซื้อสำเร็จ', 'ได้รับ: ' || item.name, 'shop', '/rewards');
  RETURN jsonb_build_object('ok', true, 'item', item.name);
END;
$$;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item(uuid) TO authenticated;

-- 8. Daily login bonus RPC
CREATE OR REPLACE FUNCTION public.claim_daily_bonus()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  p record;
  bonus int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT last_login_bonus_date, streak_days INTO p FROM public.profiles WHERE id = uid;
  IF p.last_login_bonus_date = CURRENT_DATE THEN
    RETURN jsonb_build_object('ok', false, 'message', 'คุณเคลมไปแล้ววันนี้');
  END IF;
  bonus := 5 + LEAST(COALESCE(p.streak_days, 0), 30) * 2;
  UPDATE public.profiles SET gold = gold + bonus, last_login_bonus_date = CURRENT_DATE WHERE id = uid;
  RETURN jsonb_build_object('ok', true, 'gold', bonus);
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_daily_bonus() TO authenticated;

-- 9. Seed shop items
INSERT INTO public.shop_items (name, description, kind, gold_price, title_id, icon)
SELECT 'ฉายา: ผู้กล้าหาญ', 'ฉายาพิเศษจากร้านค้า', 'title', 100, t.id, '⚔️' FROM public.titles t WHERE t.code = 'novice'
ON CONFLICT DO NOTHING;

INSERT INTO public.shop_items (name, description, kind, gold_price, title_id, icon) VALUES
  ('ฉายา: นักสำรวจ', 'ฉายาสำหรับนักผจญภัย', 'title', 250, NULL, '🧭'),
  ('ฉายา: จอมเวท', 'ฉายาสำหรับผู้เก่งกาจ', 'title', 500, NULL, '🔮'),
  ('ฉายา: ราชาแห่งความรู้', 'ฉายาสุดยอดของร้านค้า', 'title', 1000, NULL, '👑')
ON CONFLICT DO NOTHING;

-- create matching titles for those items
INSERT INTO public.titles (code, name, description) VALUES
  ('explorer', 'นักสำรวจ', 'ซื้อจากร้านค้า'),
  ('mage', 'จอมเวท', 'ซื้อจากร้านค้า'),
  ('king', 'ราชาแห่งความรู้', 'ซื้อจากร้านค้า')
ON CONFLICT (code) DO NOTHING;

UPDATE public.shop_items s SET title_id = t.id
FROM public.titles t WHERE s.title_id IS NULL AND
  ((s.name LIKE '%นักสำรวจ%' AND t.code='explorer')
   OR (s.name LIKE '%จอมเวท%' AND t.code='mage')
   OR (s.name LIKE '%ราชา%' AND t.code='king'));
