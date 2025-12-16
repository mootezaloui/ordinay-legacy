import { useState } from "react";
import { useToast } from "../contexts/ToastContext";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";

export default function Profile() {
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    firstName: "Mohamed",
    lastName: "Hammami",
    email: "m.hammami@lawfirm.tn",
    phone: "+216 98 123 456",
    title: "Avocat Principal",
    specialization: "Droit Commercial",
    barNumber: "TUN-2015-4567",
    office: "Cabinet Principal - Tunis",
    bio: "Avocat spécialisé en droit commercial avec plus de 8 ans d'expérience. Expert en contentieux commercial, droit des sociétés et arbitrage.",
  });

  const [stats] = useState({
    activeCases: 24,
    totalClients: 156,
    completedCases: 89,
    successRate: 94,
  });

  const handleChange = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    console.log("Profile saved:", profile);
    setIsEditing(false);
    // TODO: API call to save profile
    showToast("Profil mis à jour avec succès!", "success");
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset to original values if needed
  };

  return (
    <PageLayout>
      <PageHeader
        title="Mon Profil"
        subtitle="Gérer vos informations personnelles et professionnelles"
        icon="fas fa-user-circle"
        actions={
          !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
            >
              <i className="fas fa-edit"></i>
              Modifier le profil
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
                    <i className="fas fa-id-card"></i>
                    <span>{profile.barNumber}</span>
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
                <p className="text-sm text-slate-500 dark:text-slate-400">Dossiers Actifs</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {stats.activeCases}
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
                <p className="text-sm text-slate-500 dark:text-slate-400">Total Clients</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {stats.totalClients}
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
                <p className="text-sm text-slate-500 dark:text-slate-400">Dossiers Résolus</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {stats.completedCases}
                </p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <i className="fas fa-check-circle text-green-600 dark:text-green-400 text-xl"></i>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Taux de Réussite</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {stats.successRate}%
                </p>
              </div>
              <div className="p-3 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
                <i className="fas fa-trophy text-amber-600 dark:text-amber-400 text-xl"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <ContentSection title="Informations Personnelles">
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* First Name */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  Prénom
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
                  Nom
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
                  Email
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
                  Téléphone
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
            </div>
          </div>
        </ContentSection>

        {/* Professional Information */}
        <ContentSection title="Informations Professionnelles">
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  Titre
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
                  Spécialisation
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

              {/* Bar Number */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  Numéro au Barreau
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profile.barNumber}
                    onChange={(e) => handleChange("barNumber", e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">{profile.barNumber}</p>
                )}
              </div>

              {/* Office */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                  Bureau
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
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                Biographie
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
              Annuler
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
            >
              <i className="fas fa-save"></i>
              Enregistrer les modifications
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}