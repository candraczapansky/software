import { useState, useCallback } from 'react';

interface AppointmentDialogState {
  // Form dialog
  isFormOpen: boolean;
  selectedAppointmentId: number | null;
  
  // Checkout dialog
  isCheckoutOpen: boolean;
  checkoutAppointment: any | null;
  checkoutAppointmentId: number | null;
  
  // Details dialog
  isDetailsOpen: boolean;
  detailsAppointmentId: number | null;
  
  // Actions
  openNewAppointmentForm: () => void;
  openEditAppointmentForm: (appointmentId: number) => void;
  closeAppointmentForm: () => void;
  
  openCheckout: (appointment: any, appointmentId: number) => void;
  closeCheckout: () => void;
  
  openDetails: (appointmentId: number) => void;
  closeDetails: () => void;
}

export const useAppointmentDialogs = (): AppointmentDialogState => {
  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<number | null>(null);
  
  // Checkout dialog state
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutAppointment, setCheckoutAppointment] = useState<any>(null);
  const [checkoutAppointmentId, setCheckoutAppointmentId] = useState<number | null>(null);
  
  // Details dialog state
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsAppointmentId, setDetailsAppointmentId] = useState<number | null>(null);
  
  // Form actions
  const openNewAppointmentForm = useCallback(() => {
    setSelectedAppointmentId(null);
    setIsFormOpen(true);
  }, []);
  
  const openEditAppointmentForm = useCallback((appointmentId: number) => {
    setSelectedAppointmentId(appointmentId);
    setIsFormOpen(true);
  }, []);
  
  const closeAppointmentForm = useCallback(() => {
    setIsFormOpen(false);
    setSelectedAppointmentId(null);
  }, []);
  
  // Checkout actions
  const openCheckout = useCallback((appointment: any, appointmentId: number) => {
    setCheckoutAppointment(appointment);
    setCheckoutAppointmentId(appointmentId);
    setIsCheckoutOpen(true);
  }, []);
  
  const closeCheckout = useCallback(() => {
    setIsCheckoutOpen(false);
    setCheckoutAppointment(null);
    setCheckoutAppointmentId(null);
  }, []);
  
  // Details actions
  const openDetails = useCallback((appointmentId: number) => {
    setDetailsAppointmentId(appointmentId);
    setIsDetailsOpen(true);
  }, []);
  
  const closeDetails = useCallback(() => {
    setIsDetailsOpen(false);
    setDetailsAppointmentId(null);
  }, []);
  
  return {
    // Form state
    isFormOpen,
    selectedAppointmentId,
    
    // Checkout state
    isCheckoutOpen,
    checkoutAppointment,
    checkoutAppointmentId,
    
    // Details state
    isDetailsOpen,
    detailsAppointmentId,
    
    // Actions
    openNewAppointmentForm,
    openEditAppointmentForm,
    closeAppointmentForm,
    
    openCheckout,
    closeCheckout,
    
    openDetails,
    closeDetails,
  };
};
