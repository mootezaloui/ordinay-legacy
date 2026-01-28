import { useState, useEffect } from "react";
import { useToast } from "../contexts/ToastContext";
import { useOperator } from "../contexts/OperatorContext";
import { updateOperator } from "../services/api/operators";
import { getProfileStats } from "../services/api/profile";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";
import { useTranslation } from "react-i18next";

export default function Profile() {
  const { showToast } = useToast();
  const { operator, refetchOperator } = useOperator();
  const { t } = useTranslation("profile");
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    fax: "",
    mobile: "",
    title: "",
    specialization: "",
    office: "",
    officeName: "",
    officeAddress: "",
    vpa: "",
    bio: "",
  });

  const [stats, setStats] = useState({
    activeDossiers: 0,
    totalClients: 0,
    resolvedDossiers: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Initialize profile from operator
  useEffect(() => {
    if (operator) {
      // Parse operator name into first and last name
      const nameParts = operator.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      setProfile({
        firstName,
        lastName,
        email: operator.email || "",
        phone: operator.phone || "",
        fax: operator.fax || "",
        mobile: operator.mobile || "",
        title: operator.title || (operator.role === "OWNER" ? "Principal Lawyer" : operator.role),
        specialization: operator.specialization || "",
        office: operator.office || "",
        officeName: operator.office_name || "",
        officeAddress: operator.office_address || "",
        vpa: operator.vpa || "",
        bio: operator.bio || "",
      });
    }
  }, [operator]);

  // Fetch real profile statistics
  useEffect(() => {
    async function fetchStats() {
      try {
        setIsLoadingStats(true);
        const data = await getProfileStats();
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch profile stats:", error);
        showToast(t("toasts.statsError") || "Failed to load statistics", "error");
      } finally {
        setIsLoadingStats(false);
      }
    }

    fetchStats();
  }, [showToast, t]);

  const handleChange = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!operator) {
      showToast(t("toasts.saveError"), "error");
      return;
    }

    try {
      // Convert profile data to backend format
      const updates = {
        name: `${profile.firstName} ${profile.lastName}`.trim(),
        title: profile.title,
        office_name: profile.officeName,
        office_address: profile.officeAddress,
        email: profile.email,
        phone: profile.phone,
        fax: profile.fax,
        mobile: profile.mobile,
        specialization: profile.specialization,
        vpa: profile.vpa,
        office: profile.office,
        bio: profile.bio,
      };

      // Call backend API to update operator
      await updateOperator(operator.id, updates);

      // Refresh operator context to get updated data
      await refetchOperator();

      setIsEditing(false);
      showToast(t("toasts.saveSuccess"), "success");
    } catch (error) {
      console.error("Failed to save profile:", error);
      showToast(t("toasts.saveError"), "error");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset to original values if needed
  };

  return (
    <PageLayout>
      <PageHeader
        title={t("page.title")}
        subtitle={t("page.subtitle")}
        icon="fas fa-user-circle"
        actions={
          !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
            >
              <i className="fas fa-edit"></i>
              {t("actions.edit")}
            </button>
          )
        }
      />

      <div className="space-y-6">
        {/* Profile Header Card */}
        <ContentSection>
          <div className="p-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              {/* Avatar */}
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold shadow-lg">
                  {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
                </div>
                {isEditing && (
                  <button className="absolute bottom-0 right-0 w-10 h-10 bg-white dark:bg-slate-800 rounded-full border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <i className="fas fa-camera text-slate-600 dark:text-slate-400"></i>
                  </button>
                )}
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {profile.firstName} {profile.lastName}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mt-1">{profile.title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                  {profile.specialization}
                </p>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <i className="fas fa-envelope"></i>
                    <span>{profile.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <i className="fas fa-phone"></i>
                    <span>{profile.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <i className="fas fa-mobile-alt"></i>
                    <span>{profile.mobile}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <i className="fas fa-fax"></i>
                    <span>{profile.fax}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ContentSection>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("stats.activeDossiers")}</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {isLoadingStats ? "—" : stats.activeDossiers}
                </p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <i className="fas fa-folder-open text-blue-600 dark:text-blue-400 text-xl"></i>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("stats.totalClients")}</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {isLoadingStats ? "—" : stats.totalClients}
                </p>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <i className="fas fa-users text-purple-600 dark:text-purple-400 text-xl"></i>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("stats.resolvedDossiers")}</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {isLoadingStats ? "—" : stats.resolvedDossiers}
                </p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <i className="fas fa-check-circle text-green-600 dark:text-green-400 text-xl"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <ContentSection title={t("sections.personal")}>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* First Name */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.firstName")}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.firstName}
                    onChange={(e) => handleChange("firstName", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.firstName}</p>
                )}
              </div>

              {/* Last Name */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.lastName")}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.lastName}
                    onChange={(e) => handleChange("lastName", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.lastName}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.email")}
                </label>
                {isEditing ? (
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.email}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.phone")}
                </label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.phone}</p>
                )}
              </div>

              {/* Mobile */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.mobile")}
                </label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={profile.mobile}
                    onChange={(e) => handleChange("mobile", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.mobile}</p>
                )}
              </div>

              {/* Fax */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.fax")}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.fax}
                    onChange={(e) => handleChange("fax", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.fax}</p>
                )}
              </div>
            </div>
          </div>
        </ContentSection>

        {/* Professional Information */}
        <ContentSection title={t("sections.professional")}>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.title")}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.title}</p>
                )}
              </div>

              {/* Specialization */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.specialization")}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.specialization}
                    onChange={(e) => handleChange("specialization", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.specialization}</p>
                )}
              </div>

              {/* VPA */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.vpa")}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.vpa}
                    onChange={(e) => handleChange("vpa", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.vpa}</p>
                )}
              </div>

              {/* Office */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.office")}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.office}
                    onChange={(e) => handleChange("office", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.office}</p>
                )}
              </div>

              {/* Office Name */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.officeName")}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.officeName}
                    onChange={(e) => handleChange("officeName", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.officeName}</p>
                )}
              </div>

              {/* Office Address */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {t("fields.officeAddress")}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.officeAddress}
                    onChange={(e) => handleChange("officeAddress", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.officeAddress}</p>
                )}
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                {t("fields.bio")}
              </label>
              {isEditing ? (
                <textarea
                  value={profile.bio}
                  onChange={(e) => handleChange("bio", e.target.value)}
                  rows="4"
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-slate-700 dark:text-slate-300">{profile.bio}</p>
              )}
            </div>
          </div>
        </ContentSection>

        {/* Action Buttons (when editing) */}
        {isEditing && (
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={handleCancel}
              className="px-6 py-2.5 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200"
            >
              {t("actions.cancel")}
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
            >
              <i className="fas fa-save"></i>
              {t("actions.save")}
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
