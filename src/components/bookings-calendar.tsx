import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Booking = {
  id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  purpose: string;
  status: string;
  rooms?: { name: string } | null;
};

type Room = { id: string; name: string };

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-200 text-green-900 border-green-400",
  pending: "bg-yellow-200 text-yellow-900 border-yellow-400",
  rejected: "bg-red-200/60 text-red-900 border-red-400 line-through",
  cancelled: "bg-gray-200 text-gray-700 border-gray-400 line-through",
};

export function BookingsCalendar({ bookings, rooms }: { bookings: Booking[]; rooms: Room[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [roomFilter, setRoomFilter] = useState<string>("all");

  const days = useMemo(() => {
    const first = new Date(cursor);
    const startDay = first.getDay(); // 0=Sun
    const start = new Date(first);
    start.setDate(first.getDate() - startDay);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    const filtered =
      roomFilter === "all" ? bookings : bookings.filter((b) => b.room_id === roomFilter);
    for (const b of filtered) {
      const key = new Date(b.starts_at).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return map;
  }, [bookings, roomFilter]);

  const monthLabel = cursor.toLocaleDateString("th-TH", { month: "long", year: "numeric" });

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date(cursor);
                d.setMonth(d.getMonth() - 1);
                setCursor(d);
              }}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <p className="font-display text-xl min-w-[10rem] text-center">{monthLabel}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date(cursor);
                d.setMonth(d.getMonth() + 1);
                setCursor(d);
              }}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const d = new Date();
                d.setDate(1);
                d.setHours(0, 0, 0, 0);
                setCursor(d);
              }}
            >
              วันนี้
            </Button>
          </div>
          <select
            className="h-11 rounded-md border bg-background px-3 text-sm"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
          >
            <option value="all">ทุกห้อง</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden text-xs">
          {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => (
            <div key={d} className="bg-muted px-2 py-1.5 text-center font-medium">
              {d}
            </div>
          ))}
          {days.map((d, i) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = d.toDateString() === new Date().toDateString();
            const items = byDay.get(d.toDateString()) ?? [];
            return (
              <div
                key={i}
                className={`bg-background min-h-[88px] p-1.5 ${inMonth ? "" : "opacity-40"}`}
              >
                <div className={`text-right text-xs ${isToday ? "font-bold text-primary" : ""}`}>
                  {d.getDate()}
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {items.slice(0, 3).map((b) => (
                    <div
                      key={b.id}
                      className={`truncate rounded px-1 py-0.5 border text-[10px] ${STATUS_COLORS[b.status] ?? "bg-muted"}`}
                      title={`${b.rooms?.name ?? ""} • ${b.purpose} • ${new Date(b.starts_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}-${new Date(b.ends_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`}
                    >
                      {new Date(b.starts_at).toLocaleTimeString("th-TH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      {b.rooms?.name ?? ""}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className="text-[10px] text-muted-foreground">
                      +{items.length - 3} อื่นๆ
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <span className="inline-block size-3 rounded bg-green-200 border border-green-400" />{" "}
            อนุมัติ
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-3 rounded bg-yellow-200 border border-yellow-400" />{" "}
            รออนุมัติ
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-3 rounded bg-red-200/60 border border-red-400" />{" "}
            ปฏิเสธ/ยกเลิก
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
