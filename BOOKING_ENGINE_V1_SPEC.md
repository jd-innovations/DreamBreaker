# BOOKING_ENGINE_V1_SPEC.md

> Status: Draft v1
> Module: Booking Engine
> Product: PickleballApp
> Last Updated: 2026-08-08

---

# Vision

Build the **GolfNow of Pickleball** by allowing players to discover, reserve and pay for courts and ball machines from participating facilities while giving facilities a lightweight reservation management platform.

The V1 objective is speed to market.

This is **NOT** a complete club management system.

---

# Objectives

## Player

- Search for courts and ball machines
- Reserve inventory in under 60 seconds
- Pay securely
- Track upcoming reservations
- Automatically complete doubles games when possible

## Facility

- Publish court inventory
- Publish ball machines
- Accept reservations
- Create Flash Deals
- Manage reservations from one dashboard

---

# Non Goals (V1)

The following are intentionally OUT OF SCOPE.

- Lessons
- Clinics
- Camps
- Leagues
- Memberships
- Packages
- Dynamic pricing engine
- POS
- CRM
- Staff scheduling
- Paddle rentals
- Open Play reservations
- AI recommendations
- Wallet integration
- Marketplace integration

These will be implemented in future phases.

---

# Core Concepts

## Facility

A location where players can reserve inventory.

---

## Reservable Asset

V1 supports only two asset types.

- Court
- Ball Machine

Future asset types will reuse the same reservation engine.

---

## Reservation

A reservation belongs to

Facility

↓

Asset

↓

Time Slot

↓

Players

---

# Player Flow

Search

↓

Results

↓

Facility Detail

↓

Choose Time

↓

Choose Court

↓

Review Reservation

↓

Payment

↓

Confirmation

↓

My Bookings

↓

Game Status

↓

QR Check-In

---

# Facility Flow

Dashboard

↓

Court Management

↓

Ball Machine Management

↓

Calendar

↓

Reservations

↓

Flash Deals

↓

Check-In

---

# PLAYER SCREENS

---

# Screen 1 — Search

Purpose

Collect reservation intent before displaying inventory.

Fields

- Location Search
- Date Picker
- Game Format
- Players In Group
- Asset Type

Game Format

- Doubles (Default)
- Singles

Players In Group

Doubles

1

2

3

4

Singles

1

2

Asset

- Court
- Ball Machine

Primary CTA

Search Availability

---

# Screen 2 — Search Results

Displays participating facilities matching search criteria.

Each card displays

Facility Photo

Facility Name

Distance

Rating

Indoor / Outdoor

Court Count

Ball Machine Count

Starting Price

Flash Deal Badge

Favorite Button

Book CTA

Filters

Flash Deals

Price

Time

Distance

Indoor

Outdoor

Players

Court

Ball Machine

Rating

---

# Screen 3 — Facility Detail

Displays

Hero Image

Facility Information

Amenities

Weather

Directions

Book Court

Book Ball Machine

Flash Deals

Availability Summary

Persistent Booking Summary

Location

Date

Game Format

Players

---

# Screen 4 — Choose Time & Court

Displays available inventory.

Each card contains

Court Name

Indoor / Outdoor

Price

Flash Deal

Current Occupancy

Your Group

Projected Occupancy

Completion Status

Example

Court 4

Indoor

$18

Current

👤👤

Your Group

👤👤

After Booking

👤👤👤👤

Game Complete

Also display

Other Courts Available

Other Ball Machines Available

During Same Time Slot

---

# Screen 5 — Reservation

Displays

Facility

Court

Date

Time

Game Format

Players In Group

Need Players

If doubles not full

Display

Help Me Find Players

Invite Friends

---

# Screen 6 — Review

Displays

Reservation Summary

Pricing

Discount

Flash Deal

Taxes

Fees

Total

Primary CTA

Continue To Payment

---

# Screen 7 — Payment

Support

Apple Pay

Google Pay

Credit Card

Reservation Hold

Payment Success

Reservation Confirmation

---

# Screen 8 — Confirmation

Displays

Reservation Number

QR Code

Facility

Court

Time

Date

Players

Game Status

Actions

Add To Calendar

Directions

Share

Invite Friends

View Booking

---

# Screen 9 — My Bookings

Tabs

Upcoming

Past

Cancelled

Each booking displays

Facility

Court

Time

Status

Players

Game Status

---

# Screen 10 — Game Status

Displays

Current Players

Remaining Players Needed

Player List

Invite Players

Chat

When full

Game Ready

---

# Screen 11 — QR Check-In

Displays

Reservation QR

Facility

Court

Time

Reservation Status

---

# FACILITY SCREENS

---

# Dashboard

Displays

Today's Reservations

Today's Revenue

Occupancy

Flash Deals

Upcoming Reservations

Quick Actions

Create Flash Deal

Manage Courts

Reservations

---

# Court Management

Create Court

Edit Court

Delete Court

Fields

Court Name

Indoor / Outdoor

Hourly Rate

Hours

Amenities

Photos

Availability

---

# Ball Machine Management

Create

Edit

Delete

Fields

Machine Name

Hourly Rate

Hours

Description

Availability

---

# Calendar

Displays

All Courts

All Ball Machines

Occupancy

Reservations

Flash Deals

Current Booking Status

---

# Reservation Detail

Displays

Organizer

Players

Open Spots

Reservation Status

Payment Status

Check-In Status

Cancel Reservation

---

# Flash Deals

Fields

Asset

Date

Start Time

End Time

Discount %

Preview Price

Publish

---

# Reservations

Displays

Upcoming

Checked In

Cancelled

Searching For Players

Completed

---

# Check-In

Scan QR

Validate Reservation

Check Player In

---

# Reservation Engine

Reservation States

Pending

Confirmed

Cancelled

Completed

Checked In

Reservation Hold

Temporary inventory lock before payment.

---

# Occupancy Logic

The booking engine tracks

Current Occupancy

Incoming Group

Projected Occupancy

Completion Status

Examples

Current

2 / 4

Incoming

2

Projected

4 / 4

Status

Game Complete

---

Current

1 / 4

Incoming

2

Projected

3 / 4

Status

Need One Player

---

Current

0 / 4

Incoming

2

Projected

2 / 4

Status

Need Two Players

---

# Flash Deals

Facilities may discount inventory.

Fields

Asset

Start

End

Discount %

Automatically calculate discounted price.

No dynamic pricing engine in V1.

---

# Reservation Rules

No overlapping reservations.

One reservation per asset per time slot.

Default booking length

1 Hour

Maximum booking

4 Hours

Singles Capacity

2

Doubles Capacity

4

---

# Database Requirements

Conceptual only.

Tables

Facilities

Booking Assets

Reservations

Reservation Players

Flash Deals

Payments

Check Ins

Availability

---

# UI Requirements

Persistent Booking Summary

Flash Deal Cards

Occupancy Indicators

Availability Cards

Sticky Filters

Search Bar

Date Picker

Weather

Facility Cards

Reservation Cards

QR Code

---

# Design Requirements

Use existing design tokens.

No hardcoded colors.

Support Light Mode.

Support Dark Mode.

Responsive.

Accessible.

Premium appearance.

---

# Acceptance Criteria

A player can

Search

Reserve

Pay

View Reservation

Check In

A facility can

Create Courts

Create Ball Machines

Receive Reservations

Manage Reservations

Create Flash Deals

All reservation conflicts are prevented server-side.

All screens use existing design system.

No duplicate architecture introduced.

---

# Implementation Rules

Before creating any new

Component

Hook

Screen

Service

Database object

Utility

Search the existing codebase for reusable functionality.

Prefer extending existing architecture over creating new architecture.

Any newly created object must include justification explaining why an existing implementation could not be reused.

Implementation must be completed in independently testable phases.

No implementation may begin until the Booking Engine Audit has been completed.