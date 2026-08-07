import { mount } from 'cypress/react';
import { ThemeProvider } from '@saloon/ui';
import { TimeInput } from './TimeInput';

describe('TimeInput Component Test', () => {
  it('renders time input with label and default value', () => {
    const onChangeSpy = cy.spy().as('onChange');

    mount(
      <ThemeProvider>
        <TimeInput
          label="Opening Time"
          value="09:00"
          onChange={onChangeSpy}
        />
      </ThemeProvider>
    );

    // Verify label
    cy.contains('label', 'Opening Time').should('be.visible');

    // Input field should display value
    cy.get('input').should('have.value', '09:00');
  });

  it('renders error state when error prop is passed', () => {
    mount(
      <ThemeProvider>
        <TimeInput
          label="Closing Time"
          value="18:00"
          onChange={cy.stub()}
          error="Closing time must be after opening time"
        />
      </ThemeProvider>
    );

    cy.contains('Closing time must be after opening time').should('be.visible');
  });
});
