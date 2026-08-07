import { mount } from 'cypress/react';
import { MonthYearPicker } from './MonthYearPicker';

describe('MonthYearPicker Component Test', () => {
  const dates = ['2026-08-15', '2026-08-20', '2026-09-10', '2026-10-05'];

  it('renders calendar view with available date indicators and handles next month navigation', () => {
    const onPickSpy = cy.spy().as('onPick');
    const onMonthYearChangeSpy = cy.spy().as('onMonthYearChange');

    mount(
      <MonthYearPicker
        dates={dates}
        selectedDate="2026-08-15"
        onPick={onPickSpy}
        loading={false}
        isEmulated={false}
        onMonthYearChange={onMonthYearChangeSpy}
      />
    );

    // Verify component title & available date text
    cy.contains('Select Appointment Date').should('be.visible');

    // Click Next Month button
    cy.get('button[title="Next Month"]').click();
    cy.get('@onMonthYearChange').should('have.been.called');

    // Click Previous Month button
    cy.get('button[title="Previous Month"]').click();
    cy.get('@onMonthYearChange').should('have.been.called');
  });

  it('switches to List view mode and supports Month & Year dropdown selection', () => {
    const onPickSpy = cy.spy().as('onPick');
    const onMonthYearChangeSpy = cy.spy().as('onMonthYearChange');

    mount(
      <MonthYearPicker
        dates={dates}
        selectedDate="2026-08-15"
        onPick={onPickSpy}
        loading={false}
        isEmulated={false}
        onMonthYearChange={onMonthYearChangeSpy}
      />
    );

    // Switch to List mode
    cy.contains('button', 'List').click();

    // Verify Month & Year dropdown selectors
    cy.get('select').should('have.length.at.least', 2);

    // Change Month select
    cy.get('select').eq(0).select('September');
    cy.get('@onMonthYearChange').should('have.been.calledWith', 2026, 8);

    // Change Year select
    cy.get('select').eq(1).select('2026');
    cy.get('@onMonthYearChange').should('have.been.called');
  });

  it('triggers onPick when an available date is clicked', () => {
    const onPickSpy = cy.spy().as('onPick');

    mount(
      <MonthYearPicker
        dates={dates}
        selectedDate={null}
        onPick={onPickSpy}
        loading={false}
        isEmulated={false}
      />
    );

    // Click available date button
    cy.contains('button', '15').click();
    cy.get('@onPick').should('have.been.calledWith', '2026-08-15');
  });
});
