describe('Authentication, Account & Profile Operations', () => {
  const password = 'TestPass123!';

  it('handles customer login, error states, and profile viewing', () => {
    // Test invalid login credentials
    cy.visit('/login');
    cy.get('input[type="email"]').type('nonexistent_user_xyz@test.local');
    cy.get('input[type="password"]').type('WrongPass123!');
    cy.contains('button', 'Sign in').click();

    cy.contains(/invalid|failed|incorrect/i).should('be.visible');

    // Register valid user
    const email = `auth_test_${Date.now()}@saloon.test`;
    cy.contains('button', 'Create Account').click();
    cy.get('input[placeholder*="Jane Doe"]').type('Profile Tester');
    cy.get('input[type="email"]').type(email);
    cy.get('input[type="password"]').type(password);
    cy.contains('button', 'Create account').click();

    // Verify redirected
    cy.url().should('match', /\/(explore|book|my-bookings)/);

    // Navigate to Profile page
    cy.visit('/profile');
    cy.contains('h1', /Profile|Account/i).should('be.visible');
  });

  it('allows forgot password token request', () => {
    cy.visit('/forgot-password');
    cy.get('input[type="email"]').type('seeded_customer@saloon.test');
    cy.contains('button', /Send reset link|Reset password/i).click();
    cy.contains(/sent|check your email|instructions/i).should('be.visible');
  });
});
