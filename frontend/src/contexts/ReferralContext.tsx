/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useLicense } from "./LicenseContext";
import { useNotifications } from "./NotificationContext";
import {
  fetchReferralDashboard,
  fetchPendingReferralRewards,
  getOrCreateDeviceId,
  type ReferralReward,
  type ReferralDashboard,
} from "../services/licenseService";

const SEEN_REWARDS_STORAGE_KEY = "ordinay_seen_referral_rewards";
const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

interface ReferralContextValue {
  referralLink: string | null;
  referralCode: string | null;
  totalReferrals: number;
  rewards: ReferralReward[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ReferralContext = createContext<ReferralContextValue | undefined>(
  undefined,
);

function getSeenRewardIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_REWARDS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistSeenRewardIds(ids: Set<string>): void {
  try {
    localStorage.setItem(SEEN_REWARDS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore storage errors
  }
}

export function ReferralProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("referrals");
  const { licenseState, licenseData } = useLicense();
  const { addNotification, addAlert } = useNotifications();

  const [dashboard, setDashboard] = useState<ReferralDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const notifyRef = useRef({ addNotification, addAlert, t });

  useEffect(() => {
    notifyRef.current = { addNotification, addAlert, t };
  }, [addNotification, addAlert, t]);

  const notifyNewRewards = useCallback((newRewards: ReferralReward[]) => {
    const { addNotification: notify, addAlert: alert, t: tr } = notifyRef.current;
    for (const reward of newRewards) {
      // Toast notification
      alert({
        type: "success",
        title: tr("notifications.newReferral.title", {
          defaultValue: "Referral successful!",
        }),
        message: tr("notifications.newReferral.message", {
          defaultValue: "You successfully referred a new client!",
        }),
        duration: 8000,
      });

      // Persistent bell notification
      notify({
        type: "app",
        priority: "info",
        severity: "info",
        template_key: "referrals.rewardEarned",
        params: {
          rewardType: reward.reward_type,
          rewardValue: reward.reward_value,
        },
        icon: "fas fa-gift",
        link: "/settings?tab=referrals",
        addToBell: true,
        toast: false,
      });
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    if (licenseState !== "ACTIVE") return;
    setLoading(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      const result = await fetchReferralDashboard(deviceId);
      if (result.ok && result.data) {
        setDashboard(result.data);
        setError(null);

        // Check for unseen rewards
        const seen = getSeenRewardIds();
        const newRewards = result.data.rewards.filter(
          (r) => !seen.has(r.id),
        );
        if (newRewards.length > 0) {
          notifyNewRewards(newRewards);
          for (const r of newRewards) {
            seen.add(r.id);
          }
          persistSeenRewardIds(seen);
        }
      } else {
        setError(result.error || null);
      }
    } catch {
      setError("Failed to load referral data");
    } finally {
      setLoading(false);
    }
  }, [licenseState, notifyNewRewards]);

  // Initial load when license becomes active
  useEffect(() => {
    if (licenseState === "ACTIVE") {
      loadDashboard();
    } else {
      setDashboard(null);
      setError(null);
    }
  }, [licenseState, loadDashboard]);

  // Polling for new rewards
  useEffect(() => {
    if (licenseState !== "ACTIVE") {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const pollRewards = async () => {
      try {
        const deviceId = await getOrCreateDeviceId();
        const result = await fetchPendingReferralRewards(deviceId);
        if (result.ok && result.rewards.length > 0) {
          const seen = getSeenRewardIds();
          const unseen = result.rewards.filter((r) => !seen.has(r.id));
          if (unseen.length > 0) {
            notifyNewRewards(unseen);
            for (const r of unseen) {
              seen.add(r.id);
            }
            persistSeenRewardIds(seen);
            // Refresh full dashboard to update rewards list
            loadDashboard();
          }
        }
      } catch {
        // Silent failure for background polling
      }
    };

    pollRef.current = window.setInterval(pollRewards, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [licenseState, notifyNewRewards, loadDashboard]);

  // Refresh on window focus (catch rewards earned while app was in background)
  useEffect(() => {
    if (licenseState !== "ACTIVE") return;

    const handleFocus = () => {
      loadDashboard();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [licenseState, loadDashboard]);

  const value: ReferralContextValue = {
    referralLink: dashboard?.referral_link ?? null,
    referralCode: dashboard?.referral_code ?? null,
    totalReferrals: dashboard?.total_referrals ?? 0,
    rewards: dashboard?.rewards ?? [],
    loading,
    error,
    refresh: loadDashboard,
  };

  return (
    <ReferralContext.Provider value={value}>
      {children}
    </ReferralContext.Provider>
  );
}

export function useReferrals(): ReferralContextValue {
  const context = useContext(ReferralContext);
  if (!context) {
    throw new Error("useReferrals must be used within ReferralProvider");
  }
  return context;
}
