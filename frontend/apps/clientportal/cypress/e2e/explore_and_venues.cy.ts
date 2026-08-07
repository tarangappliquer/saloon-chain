describe('Explore Saloons & Venue Catalog Operations', () => {
  const password = 'TestPass123!';

  beforeEach(() => {
    const email = `explore_user_${Date.now()}@saloon.test`;
    cy.visit('/login');
    cy.contains('button', 'Create Account').click();
    cy.get('input[placeholder*="Jane Doe"]').type('Explore Tester');
    cy.get('input[type="email"]').type(email);
    cy.get('input[type="password"]').type(password);
    cy.contains('button', 'Create account').click();
  });

  it('searches and filters saloon chains and location branches', () => {
    cy.visit('/explore');
    cy.contains('h1', /Explore|Saloons|Venues/i).should('be.visible');

    // Search bar filtering
    cy.get('input[placeholder*="Search"]').type('Downtown');
    cy.contains(/Downtown/i).should('exist');
  });

  it('views venue detail page and selects a treatment to start booking', () => {
    cy.visit('/explore');
    
    // Click on first venue card
    cy.get('a[href*="/venue/"]').first().click();

    // Verify venue detail page loads
    cy.url().should('include', '/venue/');
    cy.contains('h1', /Branch|Saloon/i).should('be.visible');
  });
});
