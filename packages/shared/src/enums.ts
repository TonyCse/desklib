/** Rôles applicatifs, identiques côté API et front. */
export const ROLES = ['EMPLOYEE', 'MANAGER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** Demi-journée réservable. */
export const HALVES = ['AM', 'PM'] as const;
export type Half = (typeof HALVES)[number];

export const BOOKING_STATUSES = ['ACTIVE', 'CANCELLED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
