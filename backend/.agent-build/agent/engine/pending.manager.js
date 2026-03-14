"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PendingManager = void 0;
const errors_1 = require("../errors");
class PendingManager {
    setPending(session, action) {
        session.state.pendingAction = action;
    }
    clearPending(session) {
        session.state.pendingAction = null;
    }
    getPending(session) {
        return session.state.pendingAction;
    }
    confirmPending(session) {
        const pending = this.getPending(session);
        if (!pending) {
            throw new errors_1.SessionError("No pending action available for confirmation");
        }
        this.clearPending(session);
        return pending;
    }
    rejectPending(session) {
        const pending = this.getPending(session);
        if (!pending) {
            throw new errors_1.SessionError("No pending action available for rejection");
        }
        this.clearPending(session);
        return pending;
    }
}
exports.PendingManager = PendingManager;
