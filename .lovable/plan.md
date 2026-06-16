
# Canva Links รายบุคคลในห้องเรียน

## ปัญหา
ครูใช้ Canva สอน แต่ถ้าแชร์ลิงก์เดียวให้ทั้งห้อง เด็กไปลบงานเพื่อนได้ ต้องการให้แต่ละคนมีลิงก์ของตัวเอง กดจากในห้องเรียนแล้วเข้า Canva ได้เลย (ไม่ต้องล็อกอินอีเมล Canva)

## วิธีใช้งาน (สำหรับครู)
1. ใน Canva: สร้างไฟล์/template แล้ว **Duplicate** เป็นชุดเท่าจำนวนนักเรียน (หรือใช้ Canva for Education "Share with class" จะ duplicate ให้อัตโนมัติก็ได้)
2. ตั้ง share permission แต่ละไฟล์เป็น **"Anyone with the link — can edit"**
3. มาที่ห้องเรียนในเว็บ → แท็บใหม่ **"Canva Links"** → กด **"เพิ่มชุดลิงก์"**
   - ตั้งชื่อกิจกรรม เช่น "ใบงานบทที่ 3"
   - วางลิงก์ Canva ทีละแถว พร้อมเลือกชื่อนักเรียนจาก dropdown (หรือกด **"Bulk paste"** วางลิงก์ทั้งก้อน แล้วระบบจับคู่ตามลำดับรายชื่อให้)
4. กดบันทึก

## วิธีใช้งาน (สำหรับนักเรียน)
- เปิดห้องเรียน → แท็บ **"Canva"** → เห็นเฉพาะการ์ดของกิจกรรมที่ครูแจก พร้อมปุ่ม **"เปิด Canva ของฉัน"** → กดแล้ว redirect ไป Canva ตรงๆ
- ไม่เห็นลิงก์ของเพื่อน

## สิ่งที่จะสร้าง

### Database (1 migration)
ตาราง `canva_sessions` (ชุดกิจกรรม) และ `canva_assignments` (ลิงก์รายคน):

```text
canva_sessions
  id, classroom_id, title, description, created_by, created_at

canva_assignments
  id, session_id, student_id (FK profiles), canva_url, opened_at, created_at
```

RLS:
- ครู (owner ห้อง) จัดการได้ทุกอย่างใน session/assignments ของห้องตัวเอง
- นักเรียนอ่าน `canva_assignments` ที่ `student_id = auth.uid()` เท่านั้น (อ่าน session metadata ได้ถ้าเป็นสมาชิกห้อง)
- GRANT ตามมาตรฐาน

### Frontend (`src/routes/_authenticated/classrooms.$id.tsx`)
- เพิ่มแท็บ **"Canva"** ในห้องเรียน
- **มุมมองครู**: list ของ session, ปุ่มสร้าง/แก้ไข/ลบ, dialog ที่:
  - ใส่ title
  - ตารางแถวละ {นักเรียน, ลิงก์ Canva} เพิ่มแถวได้
  - ปุ่ม "Bulk paste" — textarea วางลิงก์บรรทัดละ 1 → auto-pair กับสมาชิกห้องตามลำดับ
  - validate ว่าเป็น `canva.com/...` หรือ `www.canva.com/...`
- **มุมมองนักเรียน**: list ของ session ที่มีลิงก์ของตัวเอง พร้อมปุ่มเปิด (target=_blank, rel=noopener), แสดง badge "เปิดแล้ว" หลังคลิก (อัปเดต `opened_at`)

## สิ่งที่ไม่ทำ (ตามที่ user ยืนยัน)
- ไม่ทำระบบ short link `/c/abc` redirect — ใช้ลิงก์ Canva ตรงๆ
- ไม่ทำ live session / banner เด้ง — เป็นแบบ on-demand รายบุคคล

## ผลลัพธ์
นักเรียนกดจากในห้องเรียน → เปิด Canva ของตัวเองได้เลย ไม่ต้องล็อกอินอีเมล Canva, ไม่ชนงานเพื่อน, ครูจัดชุดลิงก์ได้ในที่เดียว
