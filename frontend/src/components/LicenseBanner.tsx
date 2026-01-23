import { useTranslation } from "react-i18next";
import { useLicense } from "../contexts/LicenseContext";

export default function LicenseBanner() {
  const { t } = useTranslation("license");
  const { licenseState } = useLicense();

  // HARD RENDER GATE: No license UI while state is unresolved.
  // LOADING = unknown, not locked. Renders nothing until one-way transition completes.
  if (licenseState === "LOADING" || licenseState === "ACTIVE") {
    return null;
  }

  const messages: Record<string, string> = {
    FREE: t("banner.messages.FREE"),
    UNACTIVATED: t("banner.messages.UNACTIVATED"),
    ACTIVATING: t("banner.messages.ACTIVATING"),
    ACTIVE: t("banner.messages.ACTIVE"),
    EXPIRED: t("banner.messages.EXPIRED"),
    ERROR: t("banner.messages.ERROR"),
  };

  return (
    <div className="sticky top-0 z-50 w-full border-b border-amber-200 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">
      {messages[licenseState] || t("banner.messages.default")}
    </div>
  );
}
