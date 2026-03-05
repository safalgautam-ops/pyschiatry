"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { differenceInDays } from "date-fns";
import { useCallback, useMemo, useRef, useState } from "react";

import { useCalendarDnd } from "./calendar-dnd-context";
import { EventItem } from "./event-item";
import type { CalendarEvent } from "./types";

interface DraggableEventProps {
  event: CalendarEvent;
  view: "month" | "week" | "day";
  showTime?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  height?: number;
  isMultiDay?: boolean;
  multiDayWidth?: number;
  isFirstDay?: boolean;
  isLastDay?: boolean;
  "aria-hidden"?: boolean | "true" | "false";
}

export function DraggableEvent({
  event,
  view,
  showTime,
  onClick,
  height,
  isMultiDay,
  multiDayWidth,
  isFirstDay = true,
  isLastDay = true,
  "aria-hidden": ariaHidden,
}: DraggableEventProps) {
  const { activeId } = useCalendarDnd();
  const elementRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const [dragHandlePosition, setDragHandlePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Check if this is a multi-day event
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);
  const isMultiDayEvent =
    isMultiDay || event.allDay || differenceInDays(eventEnd, eventStart) >= 1;

  const draggableData = useMemo(
    () => ({
      dragHandlePosition,
      event,
      height: height ?? measuredHeight ?? null,
      isFirstDay,
      isLastDay,
      isMultiDay: isMultiDayEvent,
      multiDayWidth,
      view,
    }),
    [
      dragHandlePosition,
      event,
      height,
      measuredHeight,
      isFirstDay,
      isLastDay,
      isMultiDayEvent,
      multiDayWidth,
      view,
    ],
  );

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      data: draggableData,
      id: `${event.id}-${view}`,
    });

  // Handle mouse down to track where on the event the user clicked
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (elementRef.current) {
      const rect = elementRef.current.getBoundingClientRect();
      setDragHandlePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleSetNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      elementRef.current = node;
      setMeasuredHeight(node?.offsetHeight ?? null);
    },
    [setNodeRef],
  );

  // Don't render if this event is being dragged
  if (isDragging || activeId === `${event.id}-${view}`) {
    return (
      <div
        className="opacity-0"
        ref={setNodeRef}
        style={{ height: height || "auto" }}
      />
    );
  }

  const style = transform
    ? {
        height: height || "auto",
        transform: CSS.Translate.toString(transform),
        width:
          isMultiDayEvent && multiDayWidth ? `${multiDayWidth}%` : undefined,
      }
    : {
        height: height || "auto",
        width:
          isMultiDayEvent && multiDayWidth ? `${multiDayWidth}%` : undefined,
      };

  // Handle touch start to track where on the event the user touched
  const handleTouchStart = (e: React.TouchEvent) => {
    if (elementRef.current) {
      const rect = elementRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      if (touch) {
        setDragHandlePosition({
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        });
      }
    }
  };

  return (
    <div
      className="touch-none"
      ref={handleSetNodeRef}
      style={style}
    >
      <EventItem
        aria-hidden={ariaHidden}
        dndAttributes={attributes}
        dndListeners={listeners}
        event={event}
        isDragging={isDragging}
        isFirstDay={isFirstDay}
        isLastDay={isLastDay}
        onClick={onClick}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        showTime={showTime}
        view={view}
      />
    </div>
  );
}
