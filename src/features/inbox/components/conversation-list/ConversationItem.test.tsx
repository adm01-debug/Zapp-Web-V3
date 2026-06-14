import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConversationItem } from './ConversationItem';
import { MOCK_CONVERSATIONS } from './__mocks__/mockConversations';
import { TooltipProvider } from '@/components/ui/tooltip';

describe('ConversationItem', () => {
  const mockConversation = MOCK_CONVERSATIONS[0];

  it('renders the job title instead of phone number when job title is available', () => {
    const conversationWithJobTitle = {
      ...mockConversation,
      contact: {
        ...mockConversation.contact,
        job_title: 'Software Engineer',
        phone: '5511988887777'
      }
    };

    render(
      <TooltipProvider>
        <ConversationItem 
          conversation={conversationWithJobTitle} 
          isSelected={false} 
          onSelect={() => {}} 
        />
      </TooltipProvider>
    );

    // Should find the job title
    expect(screen.getAllByText('Software Engineer').length).toBeGreaterThan(0);
    // Should NOT find the phone number
    expect(screen.queryByText('5511988887777')).toBeNull();
  });

  it('renders fallback when job title is empty', () => {
    const conversationWithoutJobTitle = {
      ...mockConversation,
      contact: {
        ...mockConversation.contact,
        job_title: '',
        jobTitle: '',
        role: '',
        phone: '5511988887777'
      }
    };

    render(
      <TooltipProvider>
        <ConversationItem 
          conversation={conversationWithoutJobTitle} 
          isSelected={false} 
          onSelect={() => {}} 
        />
      </TooltipProvider>
    );

    // Should find the fallback text
    expect(screen.getAllByText('Cargo não informado').length).toBeGreaterThan(0);
    // Should NOT find the phone number
    expect(screen.queryByText('5511988887777')).toBeNull();
  });

  it('respects font size 15px and tracking-wide for contact name', () => {
    render(
      <TooltipProvider>
        <ConversationItem 
          conversation={mockConversation} 
          isSelected={false} 
          onSelect={() => {}} 
        />
      </TooltipProvider>
    );

    const primaryLabel = screen.getByTestId('conversation-primary');
    expect(primaryLabel.className).toContain('text-[15px]');
    expect(primaryLabel.className).toContain('tracking-wide');
  });

  it('renders company name after contact name if available', () => {
    const conversationWithCompany = {
      ...mockConversation,
      contact: {
        ...mockConversation.contact,
        company: 'Acme Corp'
      }
    };

    render(
      <TooltipProvider>
        <ConversationItem 
          conversation={conversationWithCompany} 
          isSelected={false} 
          onSelect={() => {}} 
        />
      </TooltipProvider>
    );

    // O componente renderiza "• Acme Corp" (bullet inline), então usamos matcher flexível.
    expect(screen.getByText(/Acme Corp/)).toBeDefined();
  });
});
