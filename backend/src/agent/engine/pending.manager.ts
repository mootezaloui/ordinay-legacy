import { SessionError } from "../errors";
import type { PendingAction } from "../types";
import type { Session } from "../session";

export class PendingManager {
  setPending(session: Session, action: PendingAction): void {
    session.state.pendingAction = action;
  }

  clearPending(session: Session): void {
    session.state.pendingAction = null;
  }

  getPending(session: Session): PendingAction | null {
    return session.state.pendingAction;
  }

  confirmPending(session: Session): PendingAction {
    const pending = this.getPending(session);
    if (!pending) {
      throw new SessionError("No pending action available for confirmation");
    }

    this.clearPending(session);
    return pending;
  }

  rejectPending(session: Session): PendingAction {
    const pending = this.getPending(session);
    if (!pending) {
      throw new SessionError("No pending action available for rejection");
    }

    this.clearPending(session);
    return pending;
  }
}
