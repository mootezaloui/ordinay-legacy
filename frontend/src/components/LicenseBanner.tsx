import { useLicense } from "../contexts/LicenseContext";

export default function LicenseBanner() {
  const { licenseState } = useLicense();

  if (licenseState !== "LOCKED") {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 w-full border-b border-amber-200 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">
      🔒 License inactive — Activate to continue
    </div>
  );
}
