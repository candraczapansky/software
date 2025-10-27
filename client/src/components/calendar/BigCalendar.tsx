import { Calendar, dateFnsLocalizer, Views, View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import React from 'react';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales,
});

export interface AppointmentEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resourceId?: number | string;
  resource?: any;
  type?: string;
}

export interface CalendarResource {
  resourceId: number | string;
  resourceTitle: string;
}

interface BigCalendarProps {
  events: AppointmentEvent[];
  resources?: CalendarResource[];
  backgroundEvents?: any[];
  onSelectEvent?: (event: AppointmentEvent) => void;
  onSelectSlot?: (slotInfo: any) => void;
  view?: View;
  date?: Date;
  onView?: (view: View) => void;
  onNavigate?: (date: Date) => void;
  onPreSelectResource?: (resourceId: number | string | null) => void;
  onInterceptSlotClick?: (info: { date: Date | null; resourceId: number | string | null }) => boolean | void;
  blockedColor?: string;
  unavailableColor?: string;
  availableColor?: string;
  confirmedColor?: string;
  arrivedColor?: string;
  onEventContextMenu?: (event: AppointmentEvent, position: { x: number; y: number }) => void;
  availableViews?: readonly View[];
}

const BigCalendar: React.FC<BigCalendarProps> = ({ 
  events, 
  resources, 
  backgroundEvents, 
  onSelectEvent, 
  onSelectSlot, 
  view, 
  date, 
  onView, 
  onNavigate, 
  onPreSelectResource, 
  onInterceptSlotClick, 
  blockedColor, 
  unavailableColor, 
  availableColor,
  confirmedColor,
  arrivedColor,
  onEventContextMenu,
  availableViews = [Views.DAY, Views.WEEK, Views.MONTH]
}) => {
  // Wrapper to capture which resource column is being interacted with before selection completes
  const TimeSlotWrapper = React.useCallback((props: any) => {
    const resource = (props && (props.resource || props?.slotMetrics?.resource)) ?? null;
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      try {
        const resourceId = typeof resource === 'object' && resource ? (resource.resourceId ?? resource.id ?? null) : resource;
        const dateValue = props?.value instanceof Date ? props.value : null;
        onPreSelectResource?.(resourceId ?? null);
        const intercepted = onInterceptSlotClick?.({ date: dateValue, resourceId: resourceId ?? null }) ? true : false;
        if (intercepted) {
          e.preventDefault();
          e.stopPropagation();
        }
      } catch {}
    };
    return (
      <div onMouseDown={handleMouseDown}>
        {props.children}
      </div>
    );
  }, [onPreSelectResource, onInterceptSlotClick]);

  const DateCellWrapper = React.useCallback((props: any) => {
    const resource = props?.resource ?? null;
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      try {
        const resourceId = typeof resource === 'object' && resource ? (resource.resourceId ?? resource.id ?? null) : resource;
        const dateValue = props?.value instanceof Date ? props.value : null;
        onPreSelectResource?.(resourceId ?? null);
        const intercepted = onInterceptSlotClick?.({ date: dateValue, resourceId: resourceId ?? null }) ? true : false;
        if (intercepted) {
          e.preventDefault();
          e.stopPropagation();
        }
      } catch {}
    };
    return (
      <div onMouseDown={handleMouseDown}>
        {props.children}
      </div>
    );
  }, [onPreSelectResource, onInterceptSlotClick]);

  const EventWrapper = React.useCallback((props: any) => {
    const ev = props?.event;
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      try {
        if (ev && ((ev as any).type === 'blocked' || (ev as any).type === 'available')) {
          e.preventDefault();
          e.stopPropagation();
          onSelectEvent?.(ev);
          return;
        }
      } catch {}
    };
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      try {
        if (ev && ((ev as any).type === 'blocked' || (ev as any).type === 'available')) {
          e.preventDefault();
          e.stopPropagation();
          onSelectEvent?.(ev);
          return;
        }
      } catch {}
    };
    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
      try {
        if (!ev) return;
        if ((ev as any).type === 'appointment' && onEventContextMenu) {
          e.preventDefault();
          e.stopPropagation();
          onEventContextMenu(ev as AppointmentEvent, { x: e.clientX, y: e.clientY });
          return;
        }
      } catch {}
    };
    return (
      <div onMouseDown={handleMouseDown} onClick={handleClick} onContextMenu={handleContextMenu}>
        {props.children}
      </div>
    );
  }, [onSelectEvent, onEventContextMenu]);

  const eventPropGetter = React.useCallback((event: any) => {
    if ((event as any).type === 'blocked') {
      return {
        style: {
          backgroundColor: blockedColor || '#e5e7eb',
          color: '#111827',
          border: `1px solid ${blockedColor || '#d1d5db'}`,
          opacity: 0.9,
          zIndex: 5,
          pointerEvents: 'auto',
          cursor: 'pointer',
        },
      };
    }
    if ((event as any).type === 'available') {
      return {
        style: {
          backgroundColor: availableColor || '#dbeafe',
          border: '1px solid #93c5fd',
          opacity: 0.8,
          zIndex: 2,
          pointerEvents: 'auto',
          cursor: 'pointer',
        },
      };
    }
    if ((event as any).type === 'unavailable') {
      return {
        style: {
          backgroundColor: unavailableColor || '#e5e7eb',
          border: 'none',
          opacity: ((event as any).style?.opacity ?? 0.5),
          zIndex: 1,
          pointerEvents: 'none',
        },
      };
    }

    const appointmentEvent = event as AppointmentEvent;
    const durationMinutes = (appointmentEvent.end.getTime() - appointmentEvent.start.getTime()) / 60000;
    const isFifteenMinute = durationMinutes > 0 && durationMinutes <= 16;

    const style: React.CSSProperties = { zIndex: 10, pointerEvents: 'auto' };

    const eventResource: any = appointmentEvent.resource;
    const serviceColor: string | undefined = eventResource && eventResource.serviceColor ? String(eventResource.serviceColor) : undefined;
    const isPaid: boolean = !!(eventResource && String(eventResource.paymentStatus).toLowerCase() === 'paid');
    const isConfirmedLocal: boolean = !!(eventResource && eventResource.confirmedOverride === true);
    const isArrivedLocal: boolean = !!(eventResource && eventResource.arrivedOverride === true);

    if (serviceColor) {
      style.backgroundColor = serviceColor;
      style.color = '#ffffff';
      style.border = `1px solid ${serviceColor}`;
    }
    if (isPaid) {
      style.backgroundColor = '#278741';
      style.color = '#ffffff';
      style.border = '1px solid #278741';
    } else if (isArrivedLocal && arrivedColor) {
      style.backgroundColor = arrivedColor;
      style.color = '#ffffff';
      style.border = `1px solid ${arrivedColor}`;
    } else if (isConfirmedLocal && confirmedColor) {
      style.backgroundColor = confirmedColor;
      style.color = '#ffffff';
      style.border = `1px solid ${confirmedColor}`;
    }

    if (isFifteenMinute) {
      style.transform = 'scaleY(0.5)';
      style.transformOrigin = 'top left';
      style.paddingTop = '0px';
      style.paddingBottom = '0px';
      style.lineHeight = '1';
    }
    
    return { style };
  }, [blockedColor, availableColor, unavailableColor, confirmedColor, arrivedColor]);

  const backgroundEventPropGetter = React.useCallback((event: any) => {
    if ((event as any).type === 'unavailable' || (event as any).type === 'available') {
      return {
        style: {
          pointerEvents: 'none',
          zIndex: 1,
          ...( (event as any).style || { backgroundColor: ((event as any).type === 'unavailable' ? (unavailableColor || '#e5e7eb') : '#dbeafe'), opacity: 0.5 } )
        },
      };
    }
    return {};
  }, [unavailableColor]);

  const handleDrillDown = React.useCallback((date: Date, viewName: any) => {
    try {
      const intercepted = onInterceptSlotClick?.({ date, resourceId: null }) ? true : false;
      if (!intercepted) return;
    } catch {}
  }, [onInterceptSlotClick]);

  // Limit visible time range to reduce internal scrolling and show more calendar content
  const today = new Date();
  const minTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 6, 0, 0);
  const maxTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 22, 0, 0);

  return (
    <div style={{ height: '100%' }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        views={availableViews}
        defaultView={Views.DAY}
        onSelectEvent={onSelectEvent}
        onSelectSlot={(slotInfo: any) => {
          try {
            const intercepted = onInterceptSlotClick?.({
              date: slotInfo?.start ?? null,
              resourceId: (slotInfo as any)?.resourceId ?? null,
            }) ? true : false;
            if (intercepted) {
              return;
            }
          } catch {}
          onSelectSlot?.(slotInfo);
        }}
        selectable
        style={{ height: 'auto' }}
        min={minTime}
        max={maxTime}
        step={15}
        timeslots={4}
        scrollToTime={minTime}
        resources={resources}
        resourceIdAccessor="resourceId"
        resourceTitleAccessor="resourceTitle"
        view={view}
        date={date}
        onView={onView}
        onNavigate={onNavigate}
        backgroundEvents={backgroundEvents}
        components={{
          timeSlotWrapper: TimeSlotWrapper,
          dateCellWrapper: DateCellWrapper,
          eventWrapper: EventWrapper,
        }}
        eventPropGetter={eventPropGetter}
        backgroundEventPropGetter={backgroundEventPropGetter}
        onDrillDown={handleDrillDown}
      />
    </div>
  );
};

export default BigCalendar;