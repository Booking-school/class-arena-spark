# Weekly Gamification System Design

วันที่: 2026-06-03

## เป้าหมาย

ปรับ gamification ของ Scholar Hall ให้เหมาะกับการสอนจริงที่ครูเจอนักเรียนประมาณ 2 ชั่วโมงต่อห้องต่อสัปดาห์ โดยเด็กส่วนใหญ่ใช้คอมได้ และมีงานทั้งแบบจบในคาบกับโปรเจกต์ต่อเนื่องหลายสัปดาห์

ระบบต้องช่วยให้คาบเรียน 2 ชั่วโมงคุ้มขึ้น: ระหว่างคาบเด็กทำกิจกรรม/งานหลักได้ชัดเจน ท้ายคาบเห็นสรุปความคืบหน้า และระหว่างสัปดาห์มีภารกิจเสริม 1-2 อย่างที่เด็กกลับมาทำเองได้โดยไม่ต้องกลายเป็น daily grind

## ข้อมูลจากผู้ใช้

1. ครูเจอนักเรียน 2 ชั่วโมงต่อห้องต่อสัปดาห์
2. เด็กมีโอกาสกลับมาใช้ระบบเองบ้าง ประมาณ 1-2 ครั้งต่อสัปดาห์ถ้ามีงานชัดเจน
3. ระบบควรช่วยช่วงกลางคาบและท้ายคาบมากที่สุด
4. ห้องเรียนมีประมาณ 5-30 คน แล้วแต่ชั้น
5. เด็กใช้คอมได้ประมาณ 90%
6. ม.3 เรียนคอมพิวเตอร์เชิงเครื่องมือ เนื้อหาหลักคือ Canva
7. ม.4 เรียนออกแบบและเทคโนโลยี
8. งานมีทั้งจบในคาบและโปรเจกต์ยาว
9. Gamification ควรให้รางวัลคุณภาพงาน, ความก้าวหน้า, ความพยายาม และการช่วยเพื่อน/ทำงานทีม
10. XP/คะแนนระบบผูกกับคะแนนจริงบางส่วน โดยมีคะแนนพิเศษท้ายเทอมประมาณ 3-5 คะแนน
11. Bonus ใช้แบบ leaderboard + milestone เพื่อให้มีการแข่งขันและยังยุติธรรมกับเด็กส่วนใหญ่
12. มี leaderboard รายห้องและรายสายชั้นอยู่แล้ว
13. ทีมควรเป็นทีมชั่วคราวต่อกิจกรรม ไม่ใช่ทีมถาวรทั้งเทอม
14. งานครูสั่ง ครูตรวจเอง
15. งานที่ AI สร้าง เช่น Daily Quest, flashcard recall, quiz หรือแบบฝึก ให้ AI ตรวจได้
16. งานที่ AI ตรวจต้องให้ XP ตามสัดส่วนความพยายามและความถูกต้อง ไม่ใช่ 0 หรือ 100%
17. Flashcard ให้ XP เฉพาะ milestone เช่น ทบทวนครบชุดหรือ mastery ถึงเป้าหมาย เพื่อกันการ farm XP
18. Weekly Mission ควรเป็น template อัตโนมัติที่ครูแก้ก่อนเผยแพร่ได้
19. ต่อสัปดาห์ต่อห้องควรมี 1 งานหลัก + 1-2 งานเสริม
20. งานหลักให้ participation XP ก่อน และ quality XP/badge หลังครูตรวจ
21. Badge ควรมีทั้ง badge กลางและ badge เฉพาะวิชา/ระดับชั้น
22. ท้ายคาบต้องมีทั้ง Teacher Session Dashboard และ Student Personal Recap

## หลักการออกแบบ

1. Weekly-first, not daily-first: เปลี่ยนแรงจูงใจหลักจาก daily streak เป็น weekly/session progress
2. Session closure matters: ทุกคาบควรปิดด้วยสรุปว่าใครทำอะไรแล้ว ใครค้าง และต้องทำอะไรต่อ
3. Teacher remains judge for creative work: AI ไม่ควรตัดสินงานออกแบบจริงแทนครู
4. AI grades practice work: AI เหมาะกับ quest, quiz, recall, flashcard และคำถามทบทวน
5. Proportional reward: เด็กได้ XP ตามความพยายามและสัดส่วนความถูกต้อง
6. Anti-farming: flashcard และกิจกรรมซ้ำต้องให้รางวัลจาก milestone ไม่ใช่จากการกดซ้ำ
7. Fair competition: leaderboard ยังสนุก แต่ milestone ต้องทำให้เด็กที่ไม่ติดอันดับยังมีเป้าหมาย
8. Class-size flexible: ห้อง 5 คนต้องดูรายบุคคลได้ ห้อง 30 คนต้องสรุปเร็วและจัดการง่าย

## Core Loop รายสัปดาห์

### 1. ก่อนคาบ

ครูเปิดห้องเรียนและสร้าง Weekly Mission จาก template

Weekly Mission ประกอบด้วย:

1. Main Work: งานหลักที่ครูสั่ง เช่น Canva poster, infographic, design challenge, prototype plan
2. Practice Quest: แบบฝึกหรือคำถามทบทวนที่ AI ตรวจได้
3. Flashcard Milestone หรือ Quiz: ภารกิจเสริมที่ผูกกับ mastery หรือคะแนนตามสัดส่วน

ครูต้องแก้ได้ก่อนเผยแพร่:

1. ชื่องานประจำสัปดาห์
2. คำอธิบายและ deadline
3. XP participation
4. XP quality สูงสุด
5. rubric หรือ quality marks
6. ภารกิจเสริมที่เปิดใช้งาน
7. team mode เปิด/ปิด

### 2. กลางคาบ

ครูใช้ระบบเป็นตัวคุมจังหวะกิจกรรม

นักเรียนเห็น:

1. งานหลักของคาบนี้
2. สถานะส่งงาน
3. งานเสริมที่ต้องทำ
4. XP ที่ได้ทันทีจาก participation
5. milestone ที่ใกล้ปลดล็อก

ครูเห็น:

1. ใครเปิด mission แล้ว
2. ใครส่งงานหลักแล้ว
3. ใครทำ practice quest แล้ว
4. ใครยังค้าง
5. สถานะทีมชั่วคราว ถ้าใช้ team mode

### 3. ท้ายคาบ

ระบบแสดงสรุป 2 มุม

Teacher Session Dashboard:

1. จำนวนส่งงานหลัก
2. จำนวนรอตรวจคุณภาพ
3. คะแนน practice/AI quest เฉลี่ย
4. flashcard milestone ที่ทำสำเร็จ
5. นักเรียนที่ควรตามต่อ
6. team activity summary

Student Personal Recap:

1. วันนี้ทำอะไรสำเร็จ
2. ได้ participation XP เท่าไร
3. ได้ practice XP เท่าไร
4. มีงานไหนรอตรวจคุณภาพ
5. เหลืออะไรที่ควรทำก่อนเจอครูครั้งหน้า
6. milestone หรือ badge ที่ใกล้ปลดล็อก

### 4. ระหว่างสัปดาห์

เด็กควรกลับมาใช้ระบบ 1-2 ครั้งต่อสัปดาห์จากเป้าหมายชัดเจน

งานที่เหมาะ:

1. catch-up quest สำหรับคนที่ยังทำไม่ครบ
2. flashcard review ก่อนเจอครูครั้งหน้า
3. reflection สั้นๆ หลังงานออกแบบ
4. quiz ทบทวนหน่วยเรียน

## Scoring Model

### XP จากงานหลักที่ครูสั่ง

งานหลักแยก XP เป็น 2 ส่วน

1. Participation XP: ได้ทันทีเมื่อส่งงานหรือมีหลักฐานการทำงานในคาบ
2. Quality XP: ได้หลังครูตรวจด้วย rubric

ตัวอย่างค่าเริ่มต้น:

1. Participation XP: 20-40 XP
2. Quality XP: 0-60 XP
3. Quality badge: ไม่จำเป็นต้องเป็น XP เสมอไป ใช้เน้นคุณภาพงานได้

เหตุผล: เด็กควรได้แรงจูงใจทันทีจากการส่งงาน แต่คุณภาพงานออกแบบต้องให้ครูตรวจ

### XP จากงาน AI ตรวจ

ใช้สูตรผสม effort + proportional correctness

ตัวอย่าง:

```text
earned_xp = effort_xp + round(score_ratio * performance_xp)
```

ถ้า quest มี XP สูงสุด 100:

1. effort_xp = 20 เมื่อมีคำตอบที่มีความหมาย
2. performance_xp = 80
3. เด็กได้คะแนน 60% จะได้ 20 + 48 = 68 XP

ข้อกำหนด:

1. คำตอบว่างหรือ spam ไม่ควรได้ effort XP
2. AI feedback ต้องบอกว่าได้คะแนนจากอะไร
3. partial score ต้องชัดเจนต่อข้อ
4. ครูควรดูย้อนหลังได้ถ้าเด็กโต้แย้ง

### XP จาก Flashcard

Flashcard ไม่ควรให้ XP ทุกครั้งที่กด เพราะ farm ได้ง่าย

ให้ XP เฉพาะ milestone:

1. Review ครบชุด
2. Mastery ถึง 60%
3. Mastery ถึง 80%
4. Mastery ถึง 100%
5. ทบทวนครบก่อนคาบถัดไป
6. Weekly review streak

ตัวอย่างค่าเริ่มต้น:

1. ครบชุดครั้งแรก: 20 XP
2. mastery 60%: 30 XP
3. mastery 80%: 50 XP
4. mastery 100%: badge หรือ title progress

## Bonus ท้ายเทอม

คะแนนพิเศษท้ายเทอมอยู่ที่ 3-5 คะแนน และใช้โมเดล leaderboard + milestone

### Leaderboard Bonus

มีได้ 2 ระดับ:

1. รายห้อง
2. รายสายชั้น

ข้อควรระวัง:

1. ห้ามให้ XP จากการ farm หรือ activity ซ้ำเกินควร
2. ต้องแยก contribution ของงานครูตรวจกับงาน AI ตรวจ
3. ควรแสดงเกณฑ์ให้เด็กเห็นตั้งแต่ต้นเทอม

### Milestone Bonus

เด็กที่ไม่ติดอันดับยังควรมีสิทธิ์ได้คะแนนพิเศษจาก milestone

ตัวอย่าง milestone:

1. ส่งงานหลักครบตามจำนวนที่กำหนด
2. ทำ weekly mission ครบ 70% ของเทอม
3. ทำ flashcard mastery ถึงค่าเป้าหมาย
4. มี growth score เพิ่มจากช่วงต้นเทอม
5. ได้ badge คุณภาพอย่างน้อยตามจำนวนที่กำหนด
6. ได้ peer/helper mark จากกิจกรรมทีม

## Badge System

ใช้ badge กลาง + badge เฉพาะวิชา/ระดับชั้น

### Badge กลาง

1. Consistent Learner: ทำ weekly mission ต่อเนื่อง
2. Clear Communicator: อธิบายงานหรือ reflection ชัด
3. Team Helper: ช่วยเพื่อนหรือทำงานทีมดี
4. Growth Maker: พัฒนาจากครั้งก่อนชัดเจน
5. Finish Strong: ปิดงานครบก่อน deadline

### ม.3 Canva

1. Layout Starter: จัด layout ได้ถูกหลักพื้นฐาน
2. Canva Creator: ใช้เครื่องมือ Canva ได้คล่อง
3. Visual Storyteller: งานสื่อสารภาพและข้อความชัด
4. Brand Match: ใช้สี ฟอนต์ และองค์ประกอบเข้ากัน

### ม.4 ออกแบบและเทคโนโลยี

1. Design Thinker: วิเคราะห์ปัญหาและผู้ใช้ได้ดี
2. Prototype Planner: วางแผนต้นแบบเป็นขั้นตอน
3. Problem Solver: เสนอวิธีแก้ปัญหาที่มีเหตุผล
4. Iteration Mindset: ปรับงานจาก feedback ได้ดี

## Team Mode

ทีมเป็นทีมชั่วคราวต่อกิจกรรม

ใช้เมื่อ:

1. design challenge
2. critique งานเพื่อน
3. Canva mini project
4. prototype ideation

ทีมควรมี:

1. ชื่อทีมชั่วคราว
2. สมาชิก 2-5 คน
3. team mission เฉพาะกิจ
4. team contribution mark
5. team recap หลังจบกิจกรรม

ไม่ควรผูกทีมถาวรทั้งเทอม เพราะจำนวนนักเรียนต่อห้องเปลี่ยนมากและกิจกรรมบางคาบไม่เหมาะกับทีมเดิม

## Data Model ที่ควรเพิ่ม

### weekly_missions

เก็บ mission รายสัปดาห์ต่อห้อง

Fields:

1. id
2. classroom_id
3. title
4. week_start
5. week_end
6. main_assignment_id
7. practice_quest_id
8. flashcard_deck_id
9. participation_xp
10. quality_xp_max
11. status: draft, published, closed
12. created_by
13. created_at
14. updated_at

### weekly_mission_items

เก็บงานย่อย 1 งานหลัก + 1-2 งานเสริม

Fields:

1. id
2. mission_id
3. type: main_work, ai_quest, flashcard, quiz, reflection
4. title
5. description
6. xp_max
7. required
8. sort_order
9. source_table
10. source_id

### mission_progress

สถานะของนักเรียนแต่ละคน

Fields:

1. id
2. mission_id
3. user_id
4. item_id
5. status: not_started, in_progress, submitted, reviewed, completed
6. participation_xp_awarded
7. quality_xp_awarded
8. ai_xp_awarded
9. completed_at
10. reviewed_at

### quality_marks

badge/mark จากครูสำหรับงานออกแบบ

Fields:

1. id
2. user_id
3. classroom_id
4. mission_id
5. assignment_id
6. mark_type
7. label
8. xp_bonus
9. awarded_by
10. awarded_at

### term_bonus_rules

เกณฑ์คะแนนพิเศษท้ายเทอม

Fields:

1. id
2. grade_level
3. classroom_id nullable
4. name
5. rule_type: leaderboard, milestone
6. bonus_points
7. criteria_json
8. is_active

## UI ที่ควรสร้าง

### Teacher Weekly Mission Builder

หน้าสำหรับครูสร้าง mission รายสัปดาห์

ส่วนประกอบ:

1. Template suggestions จากบทเรียนหรือ assignment
2. Main work picker
3. Practice quest picker/generator
4. Flashcard deck picker
5. XP settings
6. Rubric/quality mark preview
7. Publish button

### Teacher Session Dashboard

ใช้ระหว่างคาบและท้ายคาบ

ส่วนประกอบ:

1. live roster
2. submission status
3. practice completion
4. XP awarded today
5. pending review list
6. team mode summary
7. end-session recap action

### Student Weekly Mission Page

หน้าหลักของนักเรียนต่อห้องในสัปดาห์นั้น

ส่วนประกอบ:

1. mission header
2. main work card
3. practice quest card
4. flashcard milestone card
5. progress meter
6. recap preview

### Student Recap

แสดงหลังคาบและเข้าดูย้อนหลังได้

ส่วนประกอบ:

1. completed today
2. XP earned
3. pending teacher review
4. next steps before next class
5. milestones nearby
6. leaderboard movement

### Bonus Center

ให้เด็กเห็นเส้นทางคะแนนพิเศษท้ายเทอม

ส่วนประกอบ:

1. room leaderboard
2. grade leaderboard
3. milestone progress
4. eligible bonus points
5. rules explanation

## Implementation Plan

### Phase 1: Spec-to-UI foundation

1. เพิ่ม route สำหรับ Weekly Mission list/detail
2. สร้าง UI mock ที่ใช้ข้อมูลเดิมก่อน
3. ปรับ dashboard จาก Player Pulse ให้เป็น weekly wording
4. เปลี่ยน daily mission copy เป็น weekly/session copy
5. เพิ่ม static regression guard

เป้าหมาย: ผู้ใช้เห็น weekly loop ชัด แม้ยังไม่เพิ่ม schema ครบ

### Phase 2: Data model

1. เพิ่ม migrations สำหรับ weekly_missions, weekly_mission_items, mission_progress
2. เพิ่ม RLS แยก teacher/admin/student
3. สร้าง query helpers และ types
4. เชื่อม mission กับ assignments, daily_quests, flashcard_decks

เป้าหมาย: mission ใช้ข้อมูลจริงต่อห้องต่อสัปดาห์

### Phase 3: Teacher workflow

1. สร้าง Weekly Mission Builder
2. เพิ่ม template generation
3. เพิ่ม publish/close mission
4. เพิ่ม Teacher Session Dashboard

เป้าหมาย: ครูสร้างและใช้ mission ในคาบจริงได้

### Phase 4: Student workflow

1. สร้าง Student Weekly Mission Page
2. เชื่อม AI quest proportional XP
3. เชื่อม flashcard milestones
4. สร้าง Student Recap

เป้าหมาย: เด็กเห็นงานประจำสัปดาห์และสิ่งที่ต้องทำต่อชัดเจน

### Phase 5: Bonus and fairness

1. สร้าง Bonus Center
2. เพิ่ม milestone bonus rules
3. เพิ่ม leaderboard bonus rules
4. เพิ่ม audit visibility สำหรับ XP ที่มีผลกับคะแนนพิเศษ

เป้าหมาย: คะแนนพิเศษท้ายเทอมอธิบายได้ ตรวจสอบได้ และยุติธรรม

## Testing

1. Unit/static checks: mission wording, labels, touch targets, route guards
2. Type checks: Supabase rows, mission status, scoring calculations
3. Browser checks: teacher builder, student mission, recap, mobile layout
4. Data checks: XP ไม่ซ้ำ, flashcard milestone ไม่ farm, AI score เป็น proportional
5. Permission checks: student เห็นของตัวเอง, teacher เห็นห้องตัวเอง, admin เห็นทั้งหมด

## Open Decisions

1. ค่า XP เริ่มต้นต่อ mission ควรเป็นเท่าไรในแต่ละระดับชั้น
2. จำนวน milestone ที่ให้คะแนนพิเศษท้ายเทอมควรมีอย่างน้อยกี่แบบ
3. การรวม leaderboard รายสายชั้นต้อง normalize ตามจำนวนคาบหรือจำนวน mission หรือไม่
4. Reflection สั้นๆ ควรเป็นงานเสริมมาตรฐานหรือใช้เฉพาะบางคาบ

## Recommendation

เริ่ม implement จาก Phase 1 ก่อน เพราะทำให้ UX เปลี่ยนจาก daily เป็น weekly/session-based ได้เร็ว โดยยังไม่ต้องเพิ่ม schema หนักทันที หลังจากนั้นค่อยเพิ่ม data model และ Teacher Weekly Mission Builder
