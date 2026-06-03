# Scholar Hall Roadmap

เอกสารนี้คือรายการต่อยอดที่เหมาะกับสถานะปัจจุบันของโปรเจกต์ หลังจากปรับ landing, authenticated flows, accessibility, responsiveness และ baseline design health แล้ว

## ทำก่อน

1. Weekly gamification system: ใช้ spec ที่ `docs/superpowers/specs/2026-06-03-weekly-gamification-system-design.md` เพื่อเปลี่ยนจาก daily grind เป็น weekly mission, session recap, proportional XP, milestone bonus และทีมชั่วคราวต่อกิจกรรม
2. Activity audit log สำหรับผู้ดูแลระบบ: บันทึกการสร้าง/แก้ไขห้องเรียน การจัดการผู้ใช้ การเปลี่ยนสิทธิ์ และการกระทำสำคัญ เพื่อให้โรงเรียนตรวจสอบย้อนหลังได้
3. Parent/guardian summary: หน้าสรุปสำหรับผู้ปกครองที่เห็นความคืบหน้า attendance, quest, badge และ alert สำคัญ โดยไม่เปิดข้อมูลภายในของครูมากเกินไป
4. Teacher lesson-to-quest builder: ให้ครูสร้าง quest, flashcards และ quiz จาก lesson outline พร้อม review queue ก่อนเผยแพร่ให้นักเรียน
5. Attendance risk alerts: วิเคราะห์การขาดเรียน การมาสาย และ engagement ต่ำ เพื่อเตือนครูที่ปรึกษาก่อนปัญหาบานปลาย
6. Visual regression snapshots: จับภาพ landing, login, admin, teacher, student และ modal สำคัญแบบ seeded data เพื่อกัน UI ถอยหลังหลัง deploy

## ต่อเป็นระบบโรงเรียนเต็มรูปแบบ

1. Academic calendar และ term planning: ตั้งค่าเทอม วันหยุด ตารางสอบ และ deadline กลางของโรงเรียน
2. Gradebook และ report export: เชื่อมคะแนน quiz, quest, attendance และ rubric เป็นรายงาน PDF/CSV สำหรับครูและฝ่ายวิชาการ
3. Classroom content library: คลัง lesson template, quiz bank, flashcard deck และ rubric ที่แชร์ข้ามห้องหรือข้ามระดับชั้นได้
4. Notification preferences: ตั้งค่าการแจ้งเตือนแยกตามบทบาท เช่น admin, teacher, student, parent และช่องทาง email/in-app
5. Permission matrix: ตารางสิทธิ์แบบชัดเจนต่อ role และ group เพื่อรองรับหลายกลุ่มโรงเรียนหรือหลายแผนก

## คุณภาพก่อน production

1. Seeded end-to-end scenarios: login ทุก role, create room, create deck, join quiz, update profile และ permission denial
2. Data backup/export flow: export ข้อมูลสำคัญตามรอบเวลาและมีแนวทาง restore
3. Observability dashboard: monitor Supabase RPC, edge functions, auth failures, AI gateway latency และ error rate
4. Security review: ตรวจ RLS policies, role escalation path, exposed env vars และ admin-only flows
5. Release checklist: รวม `npm run check:full`, migration review, environment sanity และ smoke test หลัง deploy
