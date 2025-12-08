import { useState } from "react";
import { Link } from "react-router-dom";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";

// Extended notifications data
const initialNotifications = [
  {
    id: 1,
    type: "success",
    category: "Dossier",
    title: "Dossier clôturé avec succès",
    message: "Le dossier #DOS-2024-001 pour Ahmed Ben Ali a été clôturé avec succès. Tous les documents ont été archivés.",
    time: "Il y a 2 minutes",
    date: "2025-12-08 14:30",
    read: false,
    priority: "normal",
    link: "/dossiers/DOS-2024-001"
  },
  {
    id: 2,
    type: "warning",
    category: "Système",
    title: "Maintenance planifiée",
    message: "Le système sera en maintenance ce soir de 22h00 à 23h00. Veuillez sauvegarder votre travail.",
    time: "Il y a 5 minutes",
    date: "2025-12-08 14:27",
    read: false,
    priority: "high",
    link: null
  },
  {
    id: 3,
    type: "info",
    category: "Échéance",
    title: "Échéance approchant",
    message: "La date limite pour le dossier #DOS-2024-003 est dans 2 jours. N'oubliez pas de soumettre les documents requis.",
    time: "Il y a 10 minutes",
    date: "2025-12-08 14:22",
    read: true,
    priority: "high",
    link: "/dossiers/DOS-2024-003"
  },
  {
    id: 4,
    type: "success",
    category: "Client",
    title: "Nouveau client ajouté",
    message: "Leila Bouaziz a été ajoutée comme nouvelle cliente. Profil créé avec succès.",
    time: "Il y a 1 heure",
    date: "2025-12-08 13:32",
    read: true,
    priority: "normal",
    link: "/clients/4"
  },
  {
    id: 5,
    type: "urgent",
    category: "Audience",
    title: "Audience demain matin",
    message: "Rappel : Audience au tribunal de première instance demain à 9h00 pour le dossier #PRO-2024-001.",
    time: "Il y a 2 heures",
    date: "2025-12-08 12:32",
    read: false,
    priority: "urgent",
    link: "/cases/PRO-2024-001"
  },
  {
    id: 6,
    type: "info",
    category: "Tâche",
    title: "Tâche assignée",
    message: "Une nouvelle tâche 'Rédiger conclusions' vous a été assignée pour le dossier #DOS-2024-002.",
    time: "Il y a 3 heures",
    date: "2025-12-08 11:32",
    read: true,
    priority: "normal",
    link: "/tasks"
  },
  {
    id: 7,
    type: "success",
    category: "Paiement",
    title: "Paiement reçu",
    message: "Un paiement de 2,200 TND a été reçu de Fatima Trabelsi pour la facture #FACT-2024-002.",
    time: "Il y a 5 heures",
    date: "2025-12-08 09:32",
    read: true,
    priority: "normal",
    link: "/accounting"
  },
  {
    id: 8,
    type: "info",
    category: "Formation",
    title: "Nouvelle formation disponible",
    message: "Une nouvelle formation sur le 'Droit Numérique et RGPD' est maintenant disponible. Inscrivez-vous dès maintenant.",
    time: "Hier",
    date: "2025-12-07 15:20",
    read: true,
    priority: "low",
    link: "/courses"
  },
];

export default function Notifications() {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [filter, setFilter] = useState("all"); // all, unread, read
  const [categoryFilter, setCategoryFilter] = useState("all");

  const unreadCount = notifications.filter(n => !n.read).length;

  // Type configuration
  const typeConfig = {
    success: {
      bgColor: "bg-green-100 dark:bg-green-900/20",
      iconColor: "text-green-600 dark:text-green-400",
      icon: "fas fa-check-circle",
      borderColor: "border-green-200 dark:border-green-800"
    },
    warning: {
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
      iconColor: "text-amber-600 dark:text-amber-400",
      icon: "fas fa-exclamation-triangle",
      borderColor: "border-amber-200 dark:border-amber-800"
    },
    info: {
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      iconColor: "text-blue-600 dark:text-blue-400",
      icon: "fas fa-info-circle",
      borderColor: "border-blue-200 dark:border-blue-800"
    },
    urgent: {
      bgColor: "bg-red-100 dark:bg-red-900/20",
      iconColor: "text-red-600 dark:text-red-400",
      icon: "fas fa-exclamation-circle",
      borderColor: "border-red-200 dark:border-red-800"
    }
  };

  // Filter notifications
  const filteredNotifications = notifications.filter(notification => {
    const readFilter = filter === "all" ? true : 
                      filter === "unread" ? !notification.read : 
                      notification.read;
    
    const catFilter = categoryFilter === "all" ? true : 
                     notification.category === categoryFilter;
    
    return readFilter && catFilter;
  });

  const markAsRead = (id) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );
  };

  const deleteNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer toutes les notifications ?")) {
      setNotifications([]);
    }
  };

  // Get unique categories
  const categories = ["all", ...new Set(notifications.map(n => n.category))];

  return (
    <PageLayout>
      <PageHeader
        title="Notifications"
        subtitle="Gérer toutes vos notifications"
        icon="fas fa-bell"
        actions={
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
              >
                <i className="fas fa-check-double"></i>
                Tout marquer comme lu
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="px-4 py-2 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
              >
                <i className="fas fa-trash"></i>
                Tout supprimer
              </button>
            )}
          </div>
        }
      />

      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <i className="fas fa-bell text-blue-600 dark:text-blue-400 text-xl"></i>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {notifications.length}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Total</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-lg">
                <i className="fas fa-envelope text-red-600 dark:text-red-400 text-xl"></i>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {unreadCount}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Non lues</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <i className="fas fa-envelope-open text-green-600 dark:text-green-400 text-xl"></i>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {notifications.length - unreadCount}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Lues</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <ContentSection>
          <div className="p-4 flex flex-wrap items-center gap-4">
            {/* Read/Unread Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Statut:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter("all")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === "all"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                  }`}
                >
                  Toutes ({notifications.length})
                </button>
                <button
                  onClick={() => setFilter("unread")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === "unread"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                  }`}
                >
                  Non lues ({unreadCount})
                </button>
                <button
                  onClick={() => setFilter("read")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === "read"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                  }`}
                >
                  Lues ({notifications.length - unreadCount})
                </button>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-300 dark:bg-slate-600"></div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Catégorie:
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === "all" ? "Toutes" : cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </ContentSection>

        {/* Notifications List */}
        <ContentSection>
          {filteredNotifications.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                <i className="fas fa-bell-slash text-slate-400 dark:text-slate-600 text-2xl"></i>
              </div>
              <p className="text-slate-600 dark:text-slate-400 mb-2">
                Aucune notification
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-500">
                Vous n'avez pas de notifications {filter !== "all" && `${filter === "unread" ? "non lues" : "lues"}`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredNotifications.map((notification) => {
                const config = typeConfig[notification.type];
                
                return (
                  <div
                    key={notification.id}
                    className={`p-6 transition-colors duration-200 ${
                      !notification.read ? "bg-blue-50/50 dark:bg-blue-900/5" : ""
                    } hover:bg-slate-50 dark:hover:bg-slate-800/50`}
                  >
                    <div className="flex gap-4">
                      {/* Icon */}
                      <div className={`flex-shrink-0 w-12 h-12 rounded-lg ${config.bgColor} flex items-center justify-center border ${config.borderColor}`}>
                        <i className={`${config.icon} ${config.iconColor} text-xl`}></i>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-slate-900 dark:text-white">
                                {notification.title}
                              </h3>
                              {!notification.read && (
                                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                              {notification.category}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {notification.time}
                          </span>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                          {notification.message}
                        </p>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                          {notification.link && (
                            <Link
                              to={notification.link}
                              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                            >
                              Voir détails →
                            </Link>
                          )}
                          {!notification.read && (
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                            >
                              <i className="fas fa-check mr-1"></i>
                              Marquer comme lu
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notification.id)}
                            className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 ml-auto"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ContentSection>
      </div>
    </PageLayout>
  );
}