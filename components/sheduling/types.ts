export type CalendarView = "month" | "week" | "day" | "agenda";

export interface CalendarSlotOption {
  slotId: string;
  doctorUserId: string;
  doctorName: string;
  startsAt: Date;
  endsAt: Date;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  color?: EventColor;
  location?: string;
  slotId?: string;
  slotStatus?: "OPEN" | "HELD" | "BOOKED" | "BLOCKED";
  slotOptions?: CalendarSlotOption[];
}

export type EventColor =
  | "sky"
  | "amber"
  | "violet"
  | "rose"
  | "emerald"
  | "emeraldStriped"
  | "orange";
