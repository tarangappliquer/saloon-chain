import { mount } from 'cypress/react';
import { TreatmentBar } from './TreatmentBar';
import type { BookingTreatmentLine, Treatment } from '../../api/types';

describe('TreatmentBar Component Test', () => {
  const treatments: Treatment[] = [
    { id: 101, categoryId: 1, categoryName: 'Hair Care', name: 'Haircut & Style', durationSlots: 6, preTimeMinutes: 0, price: 35.00, description: '' },
    { id: 102, categoryId: 1, categoryName: 'Hair Care', name: 'Hair Wash & Blowdry', durationSlots: 4, preTimeMinutes: 0, price: 20.00, description: '' },
  ];

  const lines: BookingTreatmentLine[] = [
    {
      bookingTreatmentId: 1,
      treatmentId: 101,
      treatmentName: 'Haircut & Style',
      price: 35.00,
      durationSlots: 6,
      roomId: undefined,
      therapistId: undefined,
      therapistName: undefined,
      startTime: undefined,
      endTime: undefined,
      expiresAt: undefined,
    },
  ];

  it('renders selected treatment line items with price', () => {
    const onAddSpy = cy.spy().as('onAdd');
    const onRemoveSpy = cy.spy().as('onRemove');

    mount(
      <TreatmentBar
        treatments={treatments}
        lines={lines}
        onAdd={onAddSpy}
        onRemove={onRemoveSpy}
        loading={false}
      />
    );

    // Verify selected treatment is displayed
    cy.contains('Haircut & Style').should('be.visible');
    cy.contains('$35.00').should('be.visible');
  });

  it('triggers onRemove when remove button is clicked', () => {
    const onRemoveSpy = cy.spy().as('onRemove');

    mount(
      <TreatmentBar
        treatments={treatments}
        lines={lines}
        onAdd={cy.stub()}
        onRemove={onRemoveSpy}
        loading={false}
      />
    );

    // Click remove button using aria-label
    cy.get('button[aria-label^="Remove"]').click();
    cy.get('@onRemove').should('have.been.calledWith', 101);
  });
});
