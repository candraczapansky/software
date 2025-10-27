import { useState, useEffect } from 'react';

interface CalendarColors {
  availableColor: string;
  unavailableColor: string;
  blockedColor: string;
  confirmedColor: string;
  arrivedColor: string;
  setAvailableColor: (color: string) => void;
  setUnavailableColor: (color: string) => void;
  setBlockedColor: (color: string) => void;
  setConfirmedColor: (color: string) => void;
  setArrivedColor: (color: string) => void;
}

export const useCalendarColors = (): CalendarColors => {
  // Initialize all color states with localStorage values or defaults
  const [availableColor, setAvailableColorState] = useState<string>(
    (typeof window !== 'undefined' && localStorage.getItem('availableColor')) || '#dbeafe'
  );
  const [unavailableColor, setUnavailableColorState] = useState<string>(
    (typeof window !== 'undefined' && localStorage.getItem('unavailableColor')) || '#e5e7eb'
  );
  const [blockedColor, setBlockedColorState] = useState<string>(
    (typeof window !== 'undefined' && localStorage.getItem('blockedColor')) || '#fca5a5'
  );
  const [confirmedColor, setConfirmedColorState] = useState<string>(
    (typeof window !== 'undefined' && localStorage.getItem('confirmedColor')) || '#fde68a'
  );
  const [arrivedColor, setArrivedColorState] = useState<string>(
    (typeof window !== 'undefined' && localStorage.getItem('arrivedColor')) || '#a5b4fc'
  );

  // Wrapper functions to update both state and localStorage
  const setAvailableColor = (color: string) => {
    setAvailableColorState(color);
    if (typeof window !== 'undefined') {
      localStorage.setItem('availableColor', color);
    }
  };

  const setUnavailableColor = (color: string) => {
    setUnavailableColorState(color);
    if (typeof window !== 'undefined') {
      localStorage.setItem('unavailableColor', color);
    }
  };

  const setBlockedColor = (color: string) => {
    setBlockedColorState(color);
    if (typeof window !== 'undefined') {
      localStorage.setItem('blockedColor', color);
    }
  };

  const setConfirmedColor = (color: string) => {
    setConfirmedColorState(color);
    if (typeof window !== 'undefined') {
      localStorage.setItem('confirmedColor', color);
    }
  };

  const setArrivedColor = (color: string) => {
    setArrivedColorState(color);
    if (typeof window !== 'undefined') {
      localStorage.setItem('arrivedColor', color);
    }
  };

  return {
    availableColor,
    unavailableColor,
    blockedColor,
    confirmedColor,
    arrivedColor,
    setAvailableColor,
    setUnavailableColor,
    setBlockedColor,
    setConfirmedColor,
    setArrivedColor,
  };
};
