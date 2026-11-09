export type Service = {
  id: string; name: string; hindi: string; description: string; price: number;
  demoMinutes: number; minutes: number; icon: string; includes: string[]; tag: string;
};
export type Settings = {
  opening: string; closing: string; slotMinutes: number; capacity: number;
  leadMinutes: number; weeklyOff: number[]; durations: Record<string, number>; live: boolean;
};
export type Business = { name: string; fullName: string; owner: string; phone: string; displayPhone: string; whatsapp: string; timezone: string };
export type Meta = {
  business: Business; services: Service[]; askAtCentre: string[]; settings: Settings;
  live: boolean; demoAvailable: boolean; adminEnabled: boolean; holdMinutes: number; windowDays: number;
};
export type Slot = { time: string; endTime: string; remaining: number; available: boolean; reason: string };
export type Availability = { date: string; serviceId: string; minutes: number; opening: string; closing: string; capacity: number; slots: Slot[]; closedReason: string };
export type BookingStatus = 'awaiting_whatsapp' | 'confirmed' | 'completed' | 'cancelled';
export type Booking = {
  id: number; reference: string; requestId: string; serviceId: string; serviceName: string;
  name: string; phone: string; vehicle: string; note: string; date: string; time: string;
  endTime: string; startAt: string; endAt: string; minutes: number; price: number;
  status: BookingStatus; createdAt: string; updatedAt: string;
};
export type BookingResult = { booking: Booking; replay: boolean; demo: boolean; whatsappUrl: string | null };
export type DayBookings = { date: string; bookings: Booking[]; demo: boolean; stats: { total: number; pending: number; confirmed: number; completed: number; expectedRevenue: number } };
