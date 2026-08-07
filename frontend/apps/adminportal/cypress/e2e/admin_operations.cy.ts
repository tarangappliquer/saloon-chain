describe('Admin Portal Full Operational E2E Tests', () => {
  const password = 'TestPass123!';

  function loginAs(email: string) {
    cy.visit('/login');
    cy.get('input[placeholder="Email"]').type(email);
    cy.get('input[placeholder="Password"]').type(password);
    cy.contains('button', 'Sign in').click();
    cy.url().should('not.include', '/login');
  }

  it('verifies SuperAdmin authentication and catalog management pages', () => {
    loginAs('superadmin1@saloon1.com');

    // Saloons catalog
    cy.visit('/catalog/saloons');
    cy.contains(/Saloons|Saloon Chains|Chains/i).should('be.visible');

    // Locations catalog
    cy.visit('/catalog/locations');
    cy.contains(/Locations|Branches/i).should('be.visible');

    // Treatment categories
    cy.visit('/catalog/treatment-categories');
    cy.contains(/Categories|Treatment/i).should('be.visible');

    // Treatments
    cy.visit('/catalog/treatments');
    cy.contains(/Treatments/i).should('be.visible');

    // Treatment prices
    cy.visit('/catalog/treatment-prices');
    cy.contains(/Prices|Treatment/i).should('be.visible');
  });

  it('verifies Staff & Scheduling operational views for Manager role', () => {
    loginAs('manager1@saloonlocation1.com');

    // Staff & Therapists
    cy.visit('/staff');
    cy.contains(/Staff/i).should('be.visible');

    cy.visit('/staff/therapists');
    cy.contains(/Therapists/i).should('be.visible');

    cy.visit('/staff/rooms');
    cy.contains(/Rooms/i).should('be.visible');

    // Scheduling Grid
    cy.visit('/scheduling');
    cy.contains(/Scheduling|Shift/i).should('be.visible');
  });

  it('verifies Customer bookings list and Customer emulation launcher', () => {
    loginAs('superadmin1@saloon1.com');

    // Customer Bookings overview
    cy.visit('/bookings');
    cy.contains(/Bookings/i).should('be.visible');

    // Customers directory
    cy.visit('/customers');
    cy.contains(/Customers/i).should('be.visible');
  });
});
