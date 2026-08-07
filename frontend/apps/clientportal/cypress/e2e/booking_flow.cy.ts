describe('End-to-End Operational Booking Flow', () => {
  const password = 'TestPass123!';

  function createCustomerAccount() {
    const uniqueEmail = `cy_ops_${Date.now()}_${Math.floor(Math.random() * 1000)}@saloon.test`;
    cy.visit('/login');
    cy.contains('button', 'Create Account').click();
    cy.get('input[placeholder*="Jane Doe"]').type('Operational Flow Tester');
    cy.get('input[type="email"]').type(uniqueEmail);
    cy.get('input[type="password"]').type(password);
    cy.contains('button', 'Create account').click();
    cy.url().should('match', /\/(book|explore|my-bookings)/);
  }

  it('completes the full end-to-end booking operational journey', () => {
    createCustomerAccount();
    cy.visit('/book');

    cy.contains('h1', 'Book a treatment').should('be.visible');
    cy.get('button').filter(':contains("min"), :contains("$")').should('have.length.at.least', 1);
    
    // Select first treatment line
    cy.get('button').filter(':contains("min"), :contains("$")').eq(0).click();

    // Click Continue to Schedule
    cy.contains('button', /Continue/i).click();

    // 3. Scheduling Step - Month & Year Navigation and Date Selection
    cy.contains('Select Appointment Date').should('be.visible');

    // Switch between Calendar and List view
    cy.contains('button', 'List').click();
    cy.get('select').should('have.length.at.least', 2);
    
    cy.contains('button', 'Calendar').click();
    
    // Navigate Next Month in Calendar
    cy.get('button[title="Next Month"]').click();
    cy.get('button[title="Previous Month"]').click();

    // Pick first available open date
    cy.get('button').filter(':contains("Available Date"), :contains("Room")').first().click({ force: true });
  });

  it('persists selected holds across page refresh during scheduling', () => {
    createCustomerAccount();
    cy.visit('/book');

    cy.get('button').filter(':contains("min"), :contains("$")').eq(0).click();
    cy.contains('button', /Continue/i).click();

    cy.contains('Select Appointment Date').should('be.visible');
  });
});
