/**
 * Copy status rules (pure, unit-tested). Circulation owns ISSUED and RESERVED: they are set only
 * by issue/return/reservation workflows, never by editing a copy.
 */
export type CopyStatus =
  | 'AVAILABLE'
  | 'ISSUED'
  | 'RESERVED'
  | 'DAMAGED'
  | 'MISSING'
  | 'UNDER_REPAIR'
  | 'DISCARDED'
  | 'PENDING_VERIFICATION';

/** Statuses a librarian may choose when registering a new copy. */
export const REGISTRATION_STATUSES = [
  'AVAILABLE',
  'PENDING_VERIFICATION',
  'DAMAGED',
  'UNDER_REPAIR',
] as const satisfies readonly CopyStatus[];

/** Statuses a librarian may set by editing a copy. */
export const EDITABLE_STATUSES = [
  'AVAILABLE',
  'PENDING_VERIFICATION',
  'DAMAGED',
  'UNDER_REPAIR',
  'MISSING',
  'DISCARDED',
] as const satisfies readonly CopyStatus[];

/** Moving INTO these statuses removes a copy from lending and needs `copies.change_status`. */
export const RESTRICTED_STATUSES: readonly CopyStatus[] = [
  'DAMAGED',
  'MISSING',
  'UNDER_REPAIR',
  'DISCARDED',
];

export type TransitionCheck =
  { ok: true; needsChangeStatusPermission: boolean } | { ok: false; reason: string };

export function checkStatusTransition(from: CopyStatus, to: CopyStatus): TransitionCheck {
  if (from === to) return { ok: true, needsChangeStatusPermission: false };
  if (from === 'ISSUED' || from === 'RESERVED') {
    return {
      ok: false,
      reason: `This copy is ${from.toLowerCase()}; its status changes through circulation (return or cancel the reservation first).`,
    };
  }
  if (!(EDITABLE_STATUSES as readonly string[]).includes(to)) {
    return {
      ok: false,
      reason: `Status ${to} is set by circulation and cannot be chosen manually.`,
    };
  }
  if (from === 'DISCARDED') {
    return {
      ok: false,
      reason: 'A discarded copy cannot be returned to stock; register it again if it was found.',
    };
  }
  return {
    ok: true,
    needsChangeStatusPermission:
      RESTRICTED_STATUSES.includes(to) || RESTRICTED_STATUSES.includes(from),
  };
}
