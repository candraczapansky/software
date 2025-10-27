import { IStorage } from '../../../storage';
import type {
  ConversationFlow,
  ConversationFlowStep,
  BookingConversationState,
} from '../models/types';

export class ConversationFlowService {
  private storage: IStorage;
  private conversationFlows: Map<string, ConversationFlow>;
  private conversationStates: Map<string, BookingConversationState>;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.conversationFlows = new Map();
    this.conversationStates = new Map();
  }

  async initialize(): Promise<void> {
    // Load conversation flows from storage
    const flows = await this.storage.getConversationFlows();
    flows.forEach(flow => {
      this.conversationFlows.set(flow.id, flow);
    });
  }

  async getActiveFlow(): Promise<ConversationFlow | null> {
    for (const flow of this.conversationFlows.values()) {
      if (flow.isActive) return flow;
    }
    return null;
  }

  async getNextStep(
    phoneNumber: string,
    currentStep?: string
  ): Promise<ConversationFlowStep | null> {
    const flow = await this.getActiveFlow();
    if (!flow) return null;

    const state = this.conversationStates.get(phoneNumber);
    if (!state && !currentStep) {
      // Start with first step if no state exists
      return flow.steps[0];
    }

    // Find current step index
    const currentIndex = currentStep
      ? flow.steps.findIndex(step => step.id === currentStep)
      : -1;

    // Look for next applicable step
    for (let i = currentIndex + 1; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      if (this.stepConditionsMet(step, state)) {
        return step;
      }
    }

    return null;
  }

  private stepConditionsMet(
    step: ConversationFlowStep,
    state?: BookingConversationState
  ): boolean {
    if (!step.conditions) return true;
    if (!state) return false;

    const { hasService, hasDate, hasTime, conversationStep } = step.conditions;

    if (hasService !== undefined && !!state.selectedService !== hasService) {
      return false;
    }

    if (hasDate !== undefined && !!state.selectedDate !== hasDate) {
      return false;
    }

    if (hasTime !== undefined && !!state.selectedTime !== hasTime) {
      return false;
    }

    if (conversationStep !== undefined && state.conversationStep !== conversationStep) {
      return false;
    }

    return true;
  }

  async updateConversationState(
    phoneNumber: string,
    updates: Partial<BookingConversationState>
  ): Promise<void> {
    let state = this.conversationStates.get(phoneNumber);

    if (!state) {
      state = {
        phoneNumber,
        lastUpdated: new Date(),
        conversationStep: 'initial',
      };
    }

    Object.assign(state, updates, { lastUpdated: new Date() });
    this.conversationStates.set(phoneNumber, state);

    // Persist state to storage
    await this.storage.updateConversationState(phoneNumber, state);
  }

  async getConversationState(phoneNumber: string): Promise<BookingConversationState | null> {
    let state = this.conversationStates.get(phoneNumber);

    if (!state) {
      // Try to load from storage
      state = await this.storage.getConversationState(phoneNumber);
      if (state) {
        this.conversationStates.set(phoneNumber, state);
      }
    }

    return state || null;
  }

  async clearConversationState(phoneNumber: string): Promise<void> {
    this.conversationStates.delete(phoneNumber);
    await this.storage.deleteConversationState(phoneNumber);
  }
}
