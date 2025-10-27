import { useMemo } from 'react';

interface MonthlyCalendarProps {
  appointments: any[];
  staff: any[];
  schedules: any[];
  selectedLocation: any;
  calendarView: 'day' | 'week' | 'month';
}

export const useMonthlyCalendar = ({
  appointments,
  staff,
  schedules,
  selectedLocation,
  calendarView
}: MonthlyCalendarProps) => {
  // Filter resources (staff) based on whether they have appointments or schedules in the current month
  const filteredResources = useMemo(() => {
    if (calendarView !== 'month') {
      return staff;
    }

    return staff.filter((s: any) => {
      // Include staff if they have any appointments in the current view
      const hasAppointments = appointments.some(
        (apt: any) => apt.staffId === s.id
      );

      // Include staff if they have any schedules at the selected location
      const hasSchedules = !selectedLocation?.id || schedules.some(
        (schedule: any) => 
          schedule.staffId === s.id && 
          (schedule.locationId == null || schedule.locationId === selectedLocation.id)
      );

      return hasAppointments || hasSchedules;
    });
  }, [appointments, staff, schedules, selectedLocation, calendarView]);

  // Calculate layout properties for the monthly view
  const monthlyLayoutStyle = useMemo(() => {
    if (calendarView !== 'month') {
      return {};
    }

    return {
      minHeight: '600px',
      width: '100%'
    };
  }, [calendarView]);

  return {
    filteredResources,
    monthlyLayoutStyle
  };
};
