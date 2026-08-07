import { mount } from 'cypress/react';
import { DateInput } from './DateInput';

describe('DateInput Component Test', () => {
  it('renders date picker input with label and handles date change callback', () => {
    const onChangeSpy = cy.spy().as('onChange');

    mount(
      <DateInput
        label="Shift Date"
        value="2026-08-15"
        onChange={onChangeSpy}
        helperText="Select a work date for shift assignment"
      />
    );

    // Verify label and helper text
    cy.contains('label', 'Shift Date').should('be.visible');
    cy.contains('Select a work date for shift assignment').should('be.visible');

    // Input field should display formatted date
    cy.get('input').should('have.value', '08/15/2026');
  });

  it('displays error message when error prop is provided', () => {
    mount(
      <DateInput
        label="Shift Date"
        value="2026-08-15"
        onChange={cy.stub()}
        error="Date must be in the future"
      />
    );

    cy.contains('Date must be in the future').should('be.visible');
  });
});
