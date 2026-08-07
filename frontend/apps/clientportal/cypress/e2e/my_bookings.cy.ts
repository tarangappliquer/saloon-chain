describe('Customer My Bookings Operational Tests', () => {
  const password = 'TestPass123!';

  it('allows a customer to view and manage their bookings list', () => {
    const email = `cy_my_bookings_${Date.now()}@saloon.test`;
    cy.visit('/login');
    cy.contains('button', 'Create Account').click();
    cy.get('input[placeholder*="Jane Doe"]').type('Bookings Tester');
    cy.get('input[type="email"]').type(email);
    cy.get('input[type="password"]').type(password);
    cy.contains('button', 'Create account').click();

    // Navigate to My Bookings page
    cy.visit('/my-bookings');
    cy.contains('h1', /My Bookings|Bookings/i).should('be.visible');
  });
});
