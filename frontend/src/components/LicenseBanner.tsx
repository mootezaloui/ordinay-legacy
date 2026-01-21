import { useLicense } from "../contexts/LicenseContext";

export default function LicenseBanner() {
  const { licenseState } = useLicense();

  if (licenseState === "ACTIVE") {
    return null;
  }

  const messages = {
    FREE: "Free plan limits apply - Activate to remove limits",
    UNACTIVATED: "Activate Organia to unlock write access",
    ACTIVATING: "Activation in progress",
    ACTIVE: "",
    EXPIRED: "License expired - Activate to continue",
    ERROR: "License error - Reactivate required",
  };

  return (
    <div className="sticky top-0 z-50 w-full border-b border-amber-200 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">
      {messages[licenseState] || "License inactive - Activate to continue"}
    </div>
  );
}
