
ทำเป็นเฟส ๆ เพื่อไม่ให้พังของเดิม และ **ไม่แตะ auth.users / profiles ที่มีอยู่** (ห้ามลบ user)

## เฟส 1 — แก้ booking bugs (เร่งด่วน, เสี่ยงต่ำ)
1.1 **`book.tsx` validation**: เพิ่มเช็คฝั่ง client `ends_at > starts_at` + ขั้นต่ำ 15 นาที + ห้ามจองย้อนหลัง  
1.2 **`admin/rooms.tsx` room_type**: ตอนนี้ส่ง `"meeting"` แต่ DB constraint รับ `meeting_room` → แก้ option ให้ value ตรงกับ constraint (`classroom`, `meeting_room`, `lab`, `auditorium`, `other`)  
1.3 **Notification link bug**: route จริงคือ `/bookings` ไม่ใช่ `/admin/bookings` → แก้ trigger ใน DB ที่สร้าง notification ให้ลิงก์ `/bookings`

## เฟส 2 — เติม fields ให้ assignments/submissions (migration, ไม่ลบ data)
2.1 **`assignments`** เพิ่มคอลัมน์:
- `assignment_type` text default `'individual'` (individual/group)
- `rubric` jsonb null
- `attachments` jsonb default `'[]'`
- `sample_video_url` text null
- `status` text default `'published'` (draft/published/closed)
- `late_penalty_percent` int default 0
- `allow_late` boolean default true

2.2 **`submissions`** เพิ่ม:
- `attachments` jsonb default `'[]'` (รองรับหลายไฟล์ + external links) — เก็บ `file_url` เดิมไว้ backward-compat
- `is_late` boolean default false
- `group_member_ids` uuid[] null

ทั้งหมดใช้ `ADD COLUMN IF NOT EXISTS` + default → data เดิมไม่กระทบ

## เฟส 3 — Gradebook / Export
3.1 เพิ่ม server function `exportGradebook({ classroomId })` → คืน CSV ของคะแนนทุก assignment × นักเรียน  
3.2 เพิ่ม server function `exportAttendance({ classroomId })` → CSV attendance  
3.3 เพิ่มปุ่ม "Export Gradebook (.csv)" และ "Export Attendance (.csv)" ในหน้า `classrooms.$id.tsx` แท็บของครู

## เฟส 4 — Role-based dashboard & navigation
4.1 แยก sidebar ตาม role ชัดเจน:
- **Admin**: ผู้ใช้ / ห้อง (rooms) / คำขอจอง / อนุมัติครู
- **Teacher**: ห้องเรียน / บทเรียน / งาน / ตรวจงาน / เช็คชื่อ / Export
- **Student**: dashboard / งานค้างส่ง / quest / reward / notification

แก้ `src/components/app-sidebar.tsx` ให้แสดง group ตาม role (ของเดิมรวมหมด)

4.2 หน้า `dashboard.tsx` แยก widget ตาม role — ครูเห็น "งานรอตรวจ / นักเรียนใหม่", นักเรียนเห็น "งานค้างส่ง / quest วันนี้"

## เฟส 5 — เชื่อม AI/Rewards/Community เข้ากับ assignment+attendance+quest
5.1 ตอน grade submission สำเร็จ → ให้ XP/Gold ตาม `xp_reward`  
5.2 ตอน check-in attendance → ให้ XP เล็กน้อย + นับ streak  
5.3 ตอนทำ daily_quest เสร็จ (มีอยู่แล้ว) → trigger achievement check  
5.4 รวมที่เดียวในฟังก์ชัน `award_xp(user_id, amount, source)` (DB function) เพื่อไม่กระจาย logic

---

## หมายเหตุสำคัญ
- **ไม่มี DROP TABLE / DELETE FROM auth.users / DELETE FROM profiles** เลย ทุก migration เป็น additive (ADD COLUMN, CREATE FUNCTION)
- เฟส 1 ทำก่อนเลย เพราะเป็น bug fix ตรง ๆ
- เฟส 2-5 ทำต่อทีละเฟสตามที่ user approve

## ขอ confirm
จะเริ่มเฟส 1 (แก้ booking bugs) เลยไหม หรือให้ทำเฟสอื่นก่อน? หรืออยากทำทุกเฟสรวดเดียว?
