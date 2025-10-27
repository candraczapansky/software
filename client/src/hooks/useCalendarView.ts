import { useState, useEffect } from 'react';

type CalendarViewType = 'day' | 'week' | 'month';

interface CalendarViewState {
  selectedDate: Date;
  calendarView: CalendarViewType;
  setSelectedDate: (date: Date) => void;
  setCalendarView: (view: CalendarViewType) => void;
}

export const useCalendarView = (): CalendarViewState => {
  // Initialize selectedDate from localStorage or default to current date
  const [selectedDate, setSelectedDateState] = useState<Date>(() => {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('appointments.selectedDate');
        if (stored) {
          const ts = Number(stored);
          if (!Number.isNaN(ts)) {
            const d = new Date(ts);
            if (!isNaN(d.getTime())) return d;
          }
        }
      }
    } catch {}
    return new Date();
  });

  // Initialize calendar view from localStorage or default to 'day'
  const [calendarView, setCalendarViewState] = useState<CalendarViewType>(() => {
    try {
      if (typeof window !== 'undefined') {
        const v = localStorage.getItem('appointments.calendarView') as CalendarViewType;
        if (v === 'day' || v === 'week' || v === 'month') return v;
      }
    } catch {}
    return 'day';
  });

  // Wrapper to update both state and localStorage for selected date
  const setSelectedDate = (date: Date) => {
    setSelectedDateState(date);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('appointments.selectedDate', date.getTime().toString());
      }
    } catch {}
  };

  // Wrapper to update both state and localStorage for calendar view
  const setCalendarView = (view: CalendarViewType) => {
    setCalendarViewState(view);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('appointments.calendarView', view);
      }
    } catch {}
  };

  return {
    selectedDate,
    calendarView,
    setSelectedDate,
    setCalendarView,
  };
};
