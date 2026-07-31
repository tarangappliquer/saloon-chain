Design unified treatment booking platform for multiple saloon chains.

Technologies:

- react 19 vite
- dotnetcore 10
- sql server
- redis

Architecture:

- modular monolith with clean architecture.
- scalable upto 100K users
- SignalR + SSE
- use stored procedures in sql sever side ( this is strict requirement)
- use redis for caching when required.

# Admin Portal

- multiple saloon chains. each saloon chain have multiple locations. each location have multiple rooms
- saloon have multiple treatments available. each treatments can be categorize into different category
- each treatment have price. and its time taken (consider 5 min per slot. treatment can take multiple slots)
- users can be Super Admin, Admin, Manager, Receptionist, Therapist, Customer.
- each location have its closing time and opening time and working days.
- Admin opens a location. assign receptionist for morning/evening shift.
- Admin assignes therapist for morning/evening shift for each opened location.
- Admin assign treatment category for every room for every shifts.
- Admin can book slot for particular treatment for customer in available date for particular location.
- if treatment spaning from 9:00AM - 10:00AM is booked for room 1. then room 1 is unavailable between 9:00AM to 10:00AM
- it may be possible therapist is away for some reason, so, similar available therapist can be assigned in its place.
- **Super Admin/Admin/Manager can be marked as emulator**. emulator can emulate customer and access customer portal on behalf of him.

## Analytics

- it contains multiple reports

# Customer Portal

- Customer can login and see its previous booking history. future upcoming bookings.
- Customer can book treatment.
- For booking treatment, customer can select saloon chain then location then treatment. customer can search treatment and book treatment.

# For booking treatment in both admin/customer portal

- list of treatment for selected location appears.
- after selecting multiple treatments, customer can see avalibale dates. after selecting date, customer can see available timeslots for different treatments.
- after selecting time, customer can book treatment.
- when customer select time, book that tretment for that slot temporary to avoid conflict.

# Payment

- will be implemented in future

# Salary Ledger

- future implemetation

# Project Configuration

## API project

- dotnetcore 10 modular monolith

- signalr + sse
- serilog
- dont use entity framework core. use dappero or Microsoft.Data.Sql
- clean architecture with DI
- lowest latency as possible
- redis caching when necessary
- redis cache non-frequently changed data
- OpenAPI compatible - use scalar for OpenAPI UI
- Use background jobs when necessary (eg. validating redis data, sending out emails etc)

## client and admin portal

- react 19 + vite

- tailwind 4
- best UI/UX/DX experient
- best lighthouse report
- best performance

NOTE: use most advanced and modern aproach without leaving any edge case and bugs.
