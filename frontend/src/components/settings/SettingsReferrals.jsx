import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useReferrals } from "../../contexts/ReferralContext";
import { useLicense } from "../../contexts/LicenseContext";
import ContentSection from "../layout/ContentSection";

const STATUS_STYLES = {
  unused: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  applied: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  expired: "bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400",
};

function StatusBadge({ status, t }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || STATUS_STYLES.unused}`}
    >
      {t(`rewards.statuses.${status}`, { defaultValue: status })}
    </span>
  );
}

function RewardTypeLabel({ reward, t }) {
  const { reward_type, reward_value } = reward;
  switch (reward_type) {
    case "percentage":
      return t("rewards.types.percentage", {
        value: reward_value,
        defaultValue: `${reward_value}% discount`,
      });
    case "fixed_amount":
      return t("rewards.types.fixedAmount", {
        value: reward_value,
        defaultValue: `${reward_value} credit`,
      });
    case "extra_days":
      return t("rewards.types.extraDays", {
        value: reward_value,
        defaultValue: `${reward_value} extra days`,
      });
    case "extra_device":
      return t("rewards.types.extraDevice", {
        value: reward_value,
        defaultValue: `${reward_value} extra device slot(s)`,
      });
    case "extended_support":
      return t("rewards.types.extendedSupport", {
        value: reward_value,
        defaultValue: `${reward_value} months extended support`,
      });
    case "feature_unlock":
      return t("rewards.types.featureUnlock", {
        defaultValue: "Feature unlock",
      });
    default:
      return reward_type;
  }
}

function AppliesTo({ value, t }) {
  if (!value) return <span className="text-slate-400">-</span>;
  return (
    <span>
      {t(`rewards.appliesTo.${value}`, { defaultValue: value })}
    </span>
  );
}

export default function SettingsReferrals() {
  const { t } = useTranslation("referrals");
  const { licenseState, licenseData } = useLicense();
  const {
    referralLink,
    totalReferrals,
    rewards,
    loading,
    error,
    refresh,
  } = useReferrals();
  const [copied, setCopied] = useState(false);

  const isActive = licenseState === "ACTIVE";
  const planType = licenseData?.license_type ?? null;

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isActive) {
    return (
      <div className="space-y-6">
        <ContentSection title={t("sections.referralLink")}>
          <div className="p-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("inactiveMessage", {
                defaultValue:
                  "Activate your Ordinay license to access your referral link and earn rewards.",
              })}
            </p>
          </div>
        </ContentSection>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Referral Link Section */}
      <ContentSection title={t("sections.referralLink")}>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t("linkDescription", {
              defaultValue:
                "Share your referral link with others. When they activate Ordinay, you earn rewards.",
            })}
          </p>

          {referralLink ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 font-mono truncate select-all">
                {referralLink}
              </div>
              <button
                onClick={handleCopy}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  copied
                    ? "bg-emerald-600 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {copied
                  ? t("actions.copied", { defaultValue: "Copied!" })
                  : t("actions.copy", { defaultValue: "Copy" })}
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <i className="fas fa-spinner fa-spin" />
              {t("loading", { defaultValue: "Loading..." })}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("linkUnavailable", {
                defaultValue: "Referral link is currently unavailable.",
              })}
            </p>
          )}
        </div>
      </ContentSection>

      {/* Statistics Section */}
      <ContentSection title={t("sections.statistics")}>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                {t("stats.totalReferrals", {
                  defaultValue: "Successful referrals",
                })}
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {totalReferrals}
              </div>
            </div>
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                {t("stats.currentPlan", { defaultValue: "Your plan" })}
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white capitalize">
                {planType
                  ? t(`stats.plans.${planType}`, { defaultValue: planType })
                  : "-"}
              </div>
            </div>
          </div>
        </div>
      </ContentSection>

      {/* Rewards Section */}
      <ContentSection
        title={t("sections.rewards")}
        actions={
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 flex items-center gap-1"
          >
            <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} />
            {t("actions.refresh", { defaultValue: "Refresh" })}
          </button>
        }
      >
        <div className="p-6">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg border border-amber-200/70 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 text-sm text-amber-700 dark:text-amber-200">
              {error}
            </div>
          )}

          {rewards.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("rewards.empty", {
                defaultValue:
                  "No rewards yet. Share your referral link to start earning!",
              })}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {t("rewards.columns.type", { defaultValue: "Reward" })}
                    </th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {t("rewards.columns.status", { defaultValue: "Status" })}
                    </th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {t("rewards.columns.appliesTo", {
                        defaultValue: "Applies to",
                      })}
                    </th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {t("rewards.columns.expires", {
                        defaultValue: "Expiration",
                      })}
                    </th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {t("rewards.columns.earned", { defaultValue: "Earned" })}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rewards.map((reward) => (
                    <tr
                      key={reward.id}
                      className={
                        reward.status === "expired"
                          ? "opacity-60"
                          : ""
                      }
                    >
                      <td className="py-3 px-3 text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          <i
                            className={`text-xs ${
                              reward.status === "unused"
                                ? "fas fa-gift text-emerald-500"
                                : reward.status === "applied"
                                  ? "fas fa-check-circle text-blue-500"
                                  : "fas fa-clock text-slate-400"
                            }`}
                          />
                          <RewardTypeLabel reward={reward} t={t} />
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={reward.status} t={t} />
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                        <AppliesTo value={reward.applies_to} t={t} />
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                        {reward.expires_at
                          ? new Date(reward.expires_at).toLocaleDateString()
                          : t("rewards.noExpiry", {
                              defaultValue: "No expiry",
                            })}
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400">
                        {reward.created_at
                          ? new Date(reward.created_at).toLocaleDateString()
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ContentSection>
    </div>
  );
}
