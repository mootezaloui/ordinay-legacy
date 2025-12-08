// src/components/notifications/NotificationDropdown.jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const initialNotifications = [
  {
    title: "Dossier clôturé",
    message: "Le dossier #DOS-2024-001 a été clôturé avec succès.",
    time: "Il y a 2 min",
    read: false,
  },
  {
    title: "Alerte maintenance",
    message: "Le système sera en maintenance ce soir à partir de 22h00.",
    time: "Il y a 5 min",
    read: false,
  },
  {
    title: "Échéance approchant",
    message: "La date limite pour le dossier #DOS-2024-003 est dans 2 jours.",
    time: "Il y a 10 min",
    read: true,
  },
];

export default function NotificationDropdown() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const dropdownRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const toggleDropdown = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const markAsRead = (index) => {
    setNotifications((prev) => {
      const newNotifications = [...prev];
      newNotifications[index].read = true;
      return newNotifications;
    });
  };

  const clearNotifications = () => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer toutes les notifications ?")) {
      setNotifications([]);
      setIsOpen(false);
    }
  };

  const viewAllNotifications = () => {
    setIsOpen(false);
    navigate("/notifications");
  };

  const handleClickOutside = (event) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Notification Bell */}
      <button
        onClick={toggleDropdown}
        className={`relative p-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${
          isOpen ? "bg-slate-100 dark:bg-slate-800" : ""
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-6 w-6 transition-colors duration-200 ${
            isOpen 
              ? "text-blue-600 dark:text-blue-400" 
              : "text-slate-600 dark:text-slate-200"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341A6.002 6.002 0 006 11v3.159c0 .417-.162.82-.405 1.113L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
          />
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg transform transition-all duration-200">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-96 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
          {/* Header */}
          <div className="px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Notifications</h3>
              <span className="text-sm text-blue-100 dark:text-blue-200">{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Notification List */}
          {notifications.length > 0 ? (
            <div className="max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
              {notifications.map((notification, index) => (
                <div
                  key={index}
                  className="group relative px-6 py-4 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200 flex items-start gap-4"
                >
                  {!notification.read ? (
                    <div className="w-2 h-2 mt-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                  ) : (
                    <div className="w-2 h-2 mt-2 flex-shrink-0"></div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                      {notification.title}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {notification.message}
                    </p>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-2 block">
                      {notification.time}
                    </span>
                  </div>

                  {!notification.read && (
                    <button
                      onClick={() => markAsRead(index)}
                      className="opacity-0 group-hover:opacity-100 p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-all duration-200"
                      title="Marquer comme lu"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 text-slate-500 dark:text-slate-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 px-6 text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 mx-auto text-slate-400 dark:text-slate-500 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              <p className="text-slate-600 dark:text-slate-400">Aucune notification</p>
            </div>
          )}

          {/* Footer */}
          <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={viewAllNotifications}
              className="px-6 py-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <i className="fas fa-list"></i>
              Voir tout
            </button>
            <button
              onClick={clearNotifications}
              className="px-6 py-4 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <i className="fas fa-trash"></i>
              Tout supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}