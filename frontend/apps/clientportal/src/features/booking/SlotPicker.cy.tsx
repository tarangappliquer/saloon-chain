import { mount } from 'cypress/react';
import { SlotPicker } from './SlotPicker';
import type { AvailableSlot, BookingTreatmentLine } from '../../api/types';

describe('SlotPicker Component Test', () => {
  const lines: BookingTreatmentLine[] = [
    {
      id: 1,
      treatmentId: 101,
      treatmentName: 'Haircut & Style',
      price: 35.00,
      slotCount: 6,
      roomId: null,
      therapistId: null,
      therapistName: null,
      startTime: null,
      endTime: null,
      expiresAt: null,
    },
    {
      id: 2,
      treatmentId: 102,
      treatmentName: 'Hair Wash & Blowdry',
      price: 20.00,
      slotCount: 4,
      roomId: null,
      therapistId: null,
      therapistName: null,
      startTime: null,
      endTime: null,
      expiresAt: null,
    },
  ];

  const slotsByTreatment: Record<number, AvailableSlot[]> = {
    101: [
      { roomId: 1, therapistId: 10, startTime: '2026-08-15T09:00:00Z', endTime: '2026-08-15T09:30:00Z', isHeld: false },
      { roomId: 1, therapistId: 10, startTime: '2026-08-15T09:30:00Z', endTime: '2026-08-15T10:00:00Z', isHeld: false },
    ],
  };

  it('renders time slot buttons and triggers onSelect callback on click', () => {
    const onSelectSpy = cy.spy().as('onSelect');
    const onRemoveSpy = cy.spy().as('onRemove');

    mount(
      <SlotPicker
        lines={lines}
        slotsByTreatment={slotsByTreatment}
        onSelect={onSelectSpy}
        onRemove={onRemoveSpy}
        loading={false}
      />
    );

    // Verify treatment title
    cy.contains('Haircut & Style').should('be.visible');

    // Click available slot button in grid
    cy.get('div.grid button').first().click();
    cy.get('@onSelect').should('have.been.calledWith', 101, slotsByTreatment[101][0]);
  });

  it('renders selected badge status when a slot is already scheduled', () => {
    const scheduledLines: BookingTreatmentLine[] = [
      {
        ...lines[0],
        roomId: 1,
        therapistId: 10,
        therapistName: 'Morning Specialist',
        startTime: '2026-08-15T09:00:00Z',
        endTime: '2026-08-15T09:30:00Z',
        expiresAt: '2026-08-15T09:05:00Z',
      },
    ];

    mount(
      <SlotPicker
        lines={scheduledLines}
        slotsByTreatment={slotsByTreatment}
        onSelect={cy.stub()}
        onRemove={cy.stub()}
        loading={false}
      />
    );

    // Verify Selected badge is rendered
    cy.contains(/Selected/i).should('be.visible');
  });
});
