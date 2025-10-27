export interface SMSAutoRespondConfig {
  enabled: boolean;
  confidenceThreshold: number;
  maxResponseLength: number;
  businessHoursOnly: boolean;
  businessHours: {
    start: string;
    end: string;
    timezone: string;
  };
  excludedKeywords: string[];
  excludedPhoneNumbers: string[];
  autoRespondPhoneNumbers: string[];
}

export interface IncomingSMS {
  from: string;
  to: string;
  body: string;
  timestamp: string;
  messageId: string;
}

export interface SMSAutoRespondResult {
  success: boolean;
  responseSent: boolean;
  response?: string;
  confidence?: number;
  error?: string;
  reason?: string;
}

export interface BookingConversationState {
  phoneNumber: string;
  selectedService?: string;
  selectedDate?: string;
  selectedTime?: string;
  lastUpdated: Date;
  conversationStep: 'initial' | 'service_selected' | 'date_selected' | 'time_selected' | 'completed' | 'service_requested' | 'date_requested';
}

export interface ConversationFlowStep {
  id: string;
  type: 'trigger' | 'response' | 'question' | 'condition' | 'action';
  name: string;
  content: string;
  order: number;
  conditions?: {
    hasService?: boolean;
    hasDate?: boolean;
    hasTime?: boolean;
    conversationStep?: string;
  };
}

export interface ConversationFlow {
  id: string;
  name: string;
  description: string;
  steps: ConversationFlowStep[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
