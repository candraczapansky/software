import { useState, useEffect } from 'react';

type CalendarViewType = 'day' | 'week' | 'month';

interface CalendarViewControlProps {
  selectedStaffFilter: string;
  onViewChange?: (view: CalendarViewType) => void;
}

export const useCalendarViewControl = ({ selectedStaffFilter, onViewChange }: CalendarViewControlProps) => {
  // Initialize view from localStorage, defaulting to 'day'
  const [calendarView, setCalendarViewState] = useState<CalendarViewType>(() => {
    try {
      if (typeof window !== 'undefined') {
        const v = localStorage.getItem('appointments.calendarView') as CalendarViewType;
        if (v === 'day' || v === 'week' || v === 'month') return v;
      }
    } catch {}
    return 'day';
  });

  // When switching back to "all staff", force day view
  useEffect(() => {
    if (selectedStaffFilter === 'all' && calendarView !== 'day') {
      setCalendarView('day');
    }
  }, [selectedStaffFilter]);

  // Wrapper to update both state and localStorage
  const setCalendarView = (view: CalendarViewType) => {
    // Only allow week/month views when a specific staff is selected
    if ((view === 'week' || view === 'month') && selectedStaffFilter === 'all') {
      return;
    }

    setCalendarViewState(view);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('appointments.calendarView', view);
      }
    } catch {}
    onViewChange?.(view);
  };

  // Determine which views are available based on staff selection
  const availableViews = selectedStaffFilter !== 'all' 
    ? ['day', 'week', 'month'] as const
    : ['day'] as const;

  return {
    calendarView,
    setCalendarView,
    availableViews,
    isWeekMonthEnabled: selectedStaffFilter !== 'all'
  };
};
