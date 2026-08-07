describe('Month & Year Picker E2E Tests', () => {
  const password = 'TestPass123!';

  function setupBookingSchedulePage() {
    const email = `cypress_picker_${Date.now()}@test.local`;
    cy.visit('/login');
    cy.contains('button', 'Create Account').click();
    cy.get('input[placeholder*="Jane Doe"]').type('Picker Tester');
    cy.get('input[type="email"]').type(email);
    cy.get('input[type="password"]').type(password);
    cy.contains('button', 'Create account').click();
    cy.visit('/book');

    cy.get('button').filter(':contains("min"), :contains("$")').eq(0).click();
    cy.contains('button', /Continue/i).click();
    cy.contains('Select Appointment Date').should('be.visible');
  }

  it('navigates next and previous months in calendar mode', () => {
    setupBookingSchedulePage();

    // Verify calendar view is active
    cy.contains('button', 'Calendar').should('be.visible');

    // Click Next Month button
    cy.get('button[title="Next Month"]').click();

    // Click Previous Month button
    cy.get('button[title="Previous Month"]').click();
  });

  it('switches to List view and allows selecting Month and Year dropdowns', () => {
    setupBookingSchedulePage();

    // Switch to List mode
    cy.contains('button', 'List').click();

    // Verify Month & Year dropdown selectors exist
    cy.get('select').should('have.length.at.least', 2);

    // Change Month dropdown
    cy.get('select').eq(0).select('September');

    // Change Year dropdown
    cy.get('select').eq(1).select('2026');
  });
});
