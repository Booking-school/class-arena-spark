
-- ============ 1. Extend achievements with hidden flag + new criteria ============
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS hint text;

-- ============ 2. Extend profiles with easter-egg counters ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS night_owl_quests int NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS early_bird_quests int NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS perfect_streak int NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS max_perfect_streak int NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday_visited boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weekend_warrior_quests int NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS speed_demon_quests int NOT NULL DEFAULT 0; -- finished < 60s

-- ============ 3. Add required_title_code to daily_quests (secret quests) ============
ALTER TABLE public.daily_quests ADD COLUMN IF NOT EXISTS required_title_code text;
ALTER TABLE public.daily_quests ADD COLUMN IF NOT EXISTS is_secret boolean NOT NULL DEFAULT false;

-- ============ 4. New titles ============
INSERT INTO public.titles (code, name, description) VALUES
  ('night_owl',       'นกฮูกราตรี',     'ทำเควสต์ยามดึก'),
  ('early_bird',      'นกตื่นเช้า',     'ทำเควสต์ตอนเช้ามืด'),
  ('weekend_warrior', 'นักรบสุดสัปดาห์', 'ขยันแม้วันหยุด'),
  ('speed_demon',     'จอมความเร็ว',    'ตอบเร็วเหมือนสายฟ้า'),
  ('birthday_star',   'ดาวประจำวันเกิด','เข้าเว็บในวันเกิดตัวเอง'),
  ('class_explorer',  'นักท่องห้องเรียน','ทำเควสต์ในหลายห้องเรียน'),
  ('iron_focus',      'ใจเหล็ก',         'ตอบถูกเต็มหลายครั้งติด'),
  ('quest_master',    'จอมเควสต์',      'ผู้ปลดล็อกเควสต์ลับ'),
  ('grandmaster',     'แกรนด์มาสเตอร์',  'ระดับสูงสุดของวิชา'),
  ('mythic',          'ผู้เป็นตำนาน',   'รางวัลลับสำหรับผู้อุทิศตน')
ON CONFLICT (code) DO NOTHING;

-- ============ 5. Seed many new achievements ============
-- Visible — leveling, quests, gold milestones (classroom-friendly: ไม่ต้องเล่นทุกวัน)
INSERT INTO public.achievements (code, name, description, icon, rarity, criteria_type, criteria_value, xp_bonus, gold_bonus, is_hidden, grants_title_code) VALUES
  ('quest_1',          'เริ่มต้นการผจญภัย',  'ทำเควสต์ครั้งแรก',                    '🌱', 'common',    'quests',  1,   10,  5,   false, NULL),
  ('quest_5',          'นักเรียนขยัน',       'ทำเควสต์ครบ 5 ข้อ',                   '📘', 'common',    'quests',  5,   30,  15,  false, NULL),
  ('quest_25',         'นักเรียนตัวยง',      'ทำเควสต์ครบ 25 ข้อ',                  '📚', 'rare',      'quests',  25,  100, 50,  false, NULL),
  ('quest_100',        'ปรมาจารย์เควสต์',   'ทำเควสต์ครบ 100 ข้อ',                 '🎓', 'epic',      'quests',  100, 300, 150, false, NULL),
  ('quest_250',        'จอมเควสต์ตำนาน',    'ทำเควสต์ครบ 250 ข้อ',                 '🏆', 'legendary', 'quests',  250, 800, 400, false, 'quest_master'),
  ('level_5',          'ขั้นพื้นฐาน',         'ถึงระดับ 5',                          '🥉', 'common',    'level',   5,   25,  20,  false, NULL),
  ('level_15',         'ผู้ก้าวหน้า',         'ถึงระดับ 15',                         '🥈', 'rare',      'level',   15,  100, 60,  false, NULL),
  ('level_30',         'ผู้เชี่ยวชาญ',        'ถึงระดับ 30',                         '🥇', 'epic',      'level',   30,  300, 200, false, NULL),
  ('level_50',         'แกรนด์มาสเตอร์',     'ถึงระดับ 50',                         '👑', 'legendary', 'level',   50,  1000,500, false, 'grandmaster'),
  ('perfect_1',        'คะแนนเต็มแรก',       'ได้คะแนนเต็มครั้งแรก',                '⭐', 'common',    'perfect', 1,   20,  10,  false, NULL),
  ('perfect_10',       'มือฉมัง',            'ได้คะแนนเต็ม 10 ครั้ง',               '🌟', 'rare',      'perfect', 10,  150, 75,  false, NULL),
  ('perfect_25',       'แม่นยำเหมือนนาฬิกา', 'ได้คะแนนเต็ม 25 ครั้ง',               '🎯', 'epic',      'perfect', 25,  400, 200, false, NULL),
  ('xp_1000',          'นักสะสม XP',         'สะสม XP ครบ 1,000',                   '💎', 'common',    'xp',      1000,50,  25,  false, NULL),
  ('xp_5000',          'มหาเศรษฐี XP',       'สะสม XP ครบ 5,000',                   '💠', 'rare',      'xp',      5000,200, 100, false, NULL),
  ('xp_20000',         'อัจฉริยะ XP',        'สะสม XP ครบ 20,000',                  '🔷', 'legendary', 'xp',      20000,800,400,false, NULL),
  ('gold_500',         'พ่อค้าน้อย',         'สะสมทองครบ 500',                      '💰', 'common',    'gold',    500, 30,  0,   false, NULL),
  ('gold_2000',        'เศรษฐีทอง',          'สะสมทองครบ 2,000',                    '💵', 'rare',      'gold',    2000,150, 0,   false, NULL),
  ('gold_10000',       'ราชาทองคำ',          'สะสมทองครบ 10,000',                   '👑', 'epic',      'gold',    10000,500,0,   false, NULL)
ON CONFLICT (code) DO NOTHING;

-- Hidden / Secret achievements (มีคำใบ้แทน)
INSERT INTO public.achievements (code, name, description, icon, rarity, criteria_type, criteria_value, xp_bonus, gold_bonus, is_hidden, hint, grants_title_code) VALUES
  ('night_owl_5',      'นกฮูกราตรี',         'ทำเควสต์ตอนตี 0 - ตี 5 ครบ 5 ครั้ง',  '🦉', 'rare',      'night_owl',      5,  150, 100, true, 'มีบางอย่างซ่อนอยู่ในยามค่ำคืน...', 'night_owl'),
  ('early_bird_5',     'นกตื่นเช้า',          'ทำเควสต์ก่อน 7 โมงเช้า 5 ครั้ง',      '🐦', 'rare',      'early_bird',     5,  150, 100, true, 'ผู้ตื่นก่อนย่อมได้พบสิ่งดี...',    'early_bird'),
  ('weekend_5',        'นักรบสุดสัปดาห์',     'ทำเควสต์วันเสาร์-อาทิตย์ 5 ครั้ง',    '⚔️', 'rare',      'weekend_warrior',5,  150, 100, true, 'ขยันแม้วันที่คนอื่นพัก',         'weekend_warrior'),
  ('speed_demon_5',    'จอมความเร็ว',         'ตอบเควสต์เสร็จภายใน 60 วินาที 5 ครั้ง','⚡', 'epic',      'speed_demon',    5,  200, 150, true, 'เร็วเหมือนสายฟ้า',               'speed_demon'),
  ('iron_focus_3',     'ใจเหล็ก',             'ได้คะแนนเต็ม 3 ครั้งติดต่อกัน',       '🧘', 'rare',      'perfect_streak', 3,  150, 80,  true, 'สมาธิคือกุญแจ...',               'iron_focus'),
  ('iron_focus_7',     'ใจเหล็กแกร่ง',        'ได้คะแนนเต็ม 7 ครั้งติดต่อกัน',       '🗿', 'epic',      'perfect_streak', 7,  400, 250, true, 'สมาธิคือกุญแจ...',               NULL),
  ('class_explorer_3', 'นักท่องห้องเรียน',     'ทำเควสต์ในห้องเรียนต่างกัน 3 ห้อง',   '🗺️', 'rare',      'classrooms_quested',3,200,100, true, 'มีเควสต์รออยู่ในที่ต่างๆ',       'class_explorer'),
  ('birthday',         'สุขสันต์วันเกิด!',    'เข้าเว็บในวันเกิดของตัวเอง',          '🎂', 'epic',      'birthday',       1,  500, 300, true, 'วันพิเศษย่อมมีของขวัญ...',       'birthday_star'),
  ('mythic_devotee',   'ผู้อุทิศตน',          'ปลดล็อก Achievement อื่นครบ 15 รายการ','🌌', 'legendary','achievement_count',15,1000,500, true, '...ผู้ที่เก็บสะสมจะได้รับสิ่งพิเศษ', 'mythic')
ON CONFLICT (code) DO NOTHING;

-- ============ 6. New shop items ============
INSERT INTO public.shop_items (name, description, kind, gold_price, title_id, icon)
SELECT v.name, v.description, 'title', v.price, t.id, v.icon
FROM (VALUES
  ('ฉายา: นักท่องห้องเรียน', 'ฉายาจากร้านค้า — สำหรับผู้รักการสำรวจ', 300, '🗺️', 'class_explorer'),
  ('ฉายา: ใจเหล็ก',           'ฉายาแห่งผู้มีสมาธิดุจหินผา',            400, '🧘', 'iron_focus'),
  ('ฉายา: จอมความเร็ว',      'ฉายาของผู้ตอบเร็วดุจสายฟ้า',           450, '⚡', 'speed_demon'),
  ('ฉายา: นกฮูกราตรี',        'ฉายาลับ — เปิดเควสต์ลับยามค่ำคืน',     800, '🦉', 'night_owl'),
  ('ฉายา: นกตื่นเช้า',         'ฉายาลับ — เปิดเควสต์ลับยามเช้า',        800, '🐦', 'early_bird'),
  ('ฉายา: จอมเควสต์',         'ฉายาตำนาน — เปิดเควสต์ลับระดับสูง',    2000, '🏆', 'quest_master')
) AS v(name, description, price, icon, code)
JOIN public.titles t ON t.code = v.code
WHERE NOT EXISTS (SELECT 1 FROM public.shop_items s WHERE s.name = v.name);

-- ============ 7. Update check_and_award_achievements with new criteria types ============
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
  classroom_count int;
  ach_count int;
BEGIN
  SELECT level, xp, gold, quests_completed, streak_days, perfect_scores,
         night_owl_quests, early_bird_quests, weekend_warrior_quests, speed_demon_quests,
         max_perfect_streak, birthday_visited
  INTO p
  FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COUNT(DISTINCT dq.classroom_id) INTO classroom_count
    FROM public.daily_quest_attempts dqa
    JOIN public.daily_quests dq ON dq.id = dqa.quest_id
    WHERE dqa.user_id = _user_id;

  SELECT COUNT(*) INTO ach_count FROM public.user_achievements WHERE user_id = _user_id;

  FOR a IN SELECT * FROM public.achievements LOOP
    IF EXISTS (SELECT 1 FROM public.user_achievements WHERE user_id = _user_id AND achievement_id = a.id) THEN
      CONTINUE;
    END IF;

    player_value := CASE a.criteria_type
      WHEN 'level'              THEN p.level
      WHEN 'xp'                 THEN p.xp
      WHEN 'gold'               THEN p.gold
      WHEN 'quests'             THEN p.quests_completed
      WHEN 'streak'             THEN p.streak_days
      WHEN 'perfect'            THEN p.perfect_scores
      WHEN 'night_owl'          THEN p.night_owl_quests
      WHEN 'early_bird'         THEN p.early_bird_quests
      WHEN 'weekend_warrior'    THEN p.weekend_warrior_quests
      WHEN 'speed_demon'        THEN p.speed_demon_quests
      WHEN 'perfect_streak'     THEN p.max_perfect_streak
      WHEN 'classrooms_quested' THEN classroom_count
      WHEN 'birthday'           THEN CASE WHEN p.birthday_visited THEN 1 ELSE 0 END
      WHEN 'achievement_count'  THEN ach_count
      ELSE 0
    END;

    IF player_value >= a.criteria_value THEN
      INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (_user_id, a.id);
      UPDATE public.profiles
        SET xp = xp + a.xp_bonus, gold = gold + a.gold_bonus
        WHERE id = _user_id;
      IF a.grants_title_code IS NOT NULL THEN
        SELECT id INTO title_uuid FROM public.titles WHERE code = a.grants_title_code;
        IF title_uuid IS NOT NULL THEN
          INSERT INTO public.user_titles (user_id, title_id) VALUES (_user_id, title_uuid)
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (_user_id,
        CASE WHEN a.is_hidden THEN '🎉 ปลดล็อกความลับ: ' ELSE '🏆 ปลดล็อก: ' END || a.name,
        COALESCE(a.description, '') || ' (+'||a.xp_bonus||' XP, +'||a.gold_bonus||' ทอง)',
        'achievement', '/rewards');
    END IF;
  END LOOP;
END;
$$;

-- ============ 8. Trigger on daily_quest_attempts to bump easter-egg counters ============
CREATE OR REPLACE FUNCTION public.trg_dqa_easter_eggs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hr int;
  dow int;
  is_perfect boolean;
  duration_sec int;
BEGIN
  hr  := EXTRACT(HOUR  FROM (NEW.completed_at AT TIME ZONE 'Asia/Bangkok'))::int;
  dow := EXTRACT(ISODOW FROM (NEW.completed_at AT TIME ZONE 'Asia/Bangkok'))::int;
  is_perfect := (NEW.score >= COALESCE(NEW.max_score, 100));

  UPDATE public.profiles SET
    night_owl_quests       = night_owl_quests       + CASE WHEN hr >= 0 AND hr < 5 THEN 1 ELSE 0 END,
    early_bird_quests      = early_bird_quests      + CASE WHEN hr >= 5 AND hr < 7 THEN 1 ELSE 0 END,
    weekend_warrior_quests = weekend_warrior_quests + CASE WHEN dow IN (6,7) THEN 1 ELSE 0 END,
    perfect_streak         = CASE WHEN is_perfect THEN perfect_streak + 1 ELSE 0 END,
    max_perfect_streak     = GREATEST(max_perfect_streak, CASE WHEN is_perfect THEN perfect_streak + 1 ELSE perfect_streak END)
  WHERE id = NEW.user_id;

  -- Trigger achievement check (since this is not a profile field trigger)
  PERFORM public.check_and_award_achievements(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dqa_easter_eggs ON public.daily_quest_attempts;
CREATE TRIGGER dqa_easter_eggs
AFTER INSERT ON public.daily_quest_attempts
FOR EACH ROW
EXECUTE FUNCTION public.trg_dqa_easter_eggs();

-- ============ 9. RPC for birthday visit easter egg ============
CREATE OR REPLACE FUNCTION public.check_birthday_visit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  p record;
  today_bkk date;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT birthday, birthday_visited INTO p FROM public.profiles WHERE id = uid;
  IF p.birthday IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_birthday'); END IF;
  today_bkk := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  IF EXTRACT(MONTH FROM p.birthday) = EXTRACT(MONTH FROM today_bkk)
     AND EXTRACT(DAY FROM p.birthday) = EXTRACT(DAY FROM today_bkk)
     AND NOT p.birthday_visited THEN
    UPDATE public.profiles SET birthday_visited = true WHERE id = uid;
    PERFORM public.check_and_award_achievements(uid);
    RETURN jsonb_build_object('ok', true, 'birthday', true);
  END IF;
  RETURN jsonb_build_object('ok', true, 'birthday', false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_birthday_visit() TO authenticated;

-- Reset birthday_visited each year (when not their birthday anymore)
CREATE OR REPLACE FUNCTION public.reset_birthday_flag_if_needed(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE p record; today_bkk date;
BEGIN
  SELECT birthday, birthday_visited INTO p FROM public.profiles WHERE id = _user_id;
  IF p.birthday IS NULL OR NOT p.birthday_visited THEN RETURN; END IF;
  today_bkk := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  IF EXTRACT(MONTH FROM p.birthday) <> EXTRACT(MONTH FROM today_bkk)
     OR EXTRACT(DAY FROM p.birthday) <> EXTRACT(DAY FROM today_bkk) THEN
    UPDATE public.profiles SET birthday_visited = false WHERE id = _user_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reset_birthday_flag_if_needed(uuid) TO authenticated;
