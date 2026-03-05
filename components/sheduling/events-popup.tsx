"use client";

import { format, isSameDay } from "date-fns";
import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { EventItem } from "./event-item";
import type { CalendarEvent } from "./types";

interface EventsPopupProps {
  date: Date;
  events: CalendarEvent[];
  position: { top: number; left: number };
  onClose: () => void;
  onEventSelect: (event: CalendarEvent) => void;
}

export function EventsPopup({
  date,
  events,
  position,
  onClose,
  onEventSelect,
}: EventsPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close popup
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Handle escape key to close popup
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscKey);
    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [onClose]);

  const handleEventClick = (event: CalendarEvent) => {
    onEventSelect(event);
    onClose();
  };

  useEffect(() => {
    const node = popupRef.current;
    if (!node) return;

    const frame = requestAnimationFrame(() => {
      const popupWidth = node.offsetWidth;
      const popupHeight = node.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      let nextLeft = position.left;
      let nextTop = position.top;

      if (nextLeft + popupWidth > viewportWidth) {
        nextLeft = Math.max(0, viewportWidth - popupWidth);
      }
      if (nextTop + popupHeight > viewportHeight) {
        nextTop = Math.max(0, viewportHeight - popupHeight);
      }

      node.style.left = `${nextLeft}px`;
      node.style.top = `${nextTop}px`;
    });

    return () => cancelAnimationFrame(frame);
  }, [position, events.length]);

  return (
    <div
      className="absolute z-50 max-h-96 w-80 overflow-auto rounded-md border bg-background shadow-lg"
      ref={popupRef}
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
      }}
    >
      <div className="sticky top-0 flex items-center justify-between border-b bg-background p-3">
        <h3 className="font-medium">{format(date, "d MMMM yyyy")}</h3>
        <button
          aria-label="Close"
          className="rounded-full p-1 hover:bg-muted"
          onClick={onClose}
          type="button"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 p-3">
        {events.length === 0 ? (
          <div className="py-2 text-muted-foreground text-sm">No events</div>
        ) : (
          events.map((event) => {
            const eventStart = new Date(event.start);
            const eventEnd = new Date(event.end);
            const isFirstDay = isSameDay(date, eventStart);
            const isLastDay = isSameDay(date, eventEnd);

            return (
              <div
                className="cursor-pointer"
                key={event.id}
                onClick={() => handleEventClick(event)}
              >
                <EventItem
                  event={event}
                  isFirstDay={isFirstDay}
                  isLastDay={isLastDay}
                  view="agenda"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
