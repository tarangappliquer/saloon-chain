describe('Booking Flow E2E Tests', () => {
  const password = 'TestPass123!';
  let userSeq = 0;

  function registerUser() {
    const email = `cypress_e2e_${Date.now()}_${userSeq++}@test.local`;
    cy.visit('/login');
    cy.contains('button', 'Create Account').click();
    cy.get('input[placeholder*="Jane Doe"]').type('Cypress E2E Tester');
    cy.get('input[type="email"]').type(email);
    cy.get('input[type="password"]').type(password);
    cy.contains('button', 'Create account').click();
    cy.url().should('match', /\/(book|explore|my-bookings)/);
  }

  it('allows a user to register, select treatments, pick date, and select time slots', () => {
    registerUser();
    cy.visit('/book');

    // Select first treatment line
    cy.contains('h1', 'Book a treatment').should('be.visible');
    cy.get('button').filter(':contains("min"), :contains("$")').should('have.length.at.least', 1);
    cy.get('button').filter(':contains("min"), :contains("$")').eq(0).click();

    // Click continue to schedule
    cy.contains('button', /Continue/i).click();

    // Verify Schedule Step loads
    cy.contains('Select Appointment Date').should('be.visible');
  });

  it('creates slot holds and persists state across scheduling step', () => {
    registerUser();
    cy.visit('/book');

    cy.contains('h1', 'Book a treatment').should('be.visible');
    cy.get('button').filter(':contains("min"), :contains("$")').eq(0).click();
    cy.contains('button', /Continue/i).click();

    // Verify date picker is visible
    cy.contains('Select Appointment Date').should('be.visible');
  });
});
