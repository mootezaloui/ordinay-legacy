import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../contexts/ThemeProvider";

/**
 * UserDropdown Component
 * Matches the style of NotificationDropdown
 */
export default function UserDropdown() {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const toggleDropdown = (e) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            setIsOpen(false);
        }
    };

    const handleNavigation = (path) => {
        setIsOpen(false);
        navigate(path);
    };

    const handleLogout = () => {
        setIsOpen(false);
        // Add your logout logic here
        navigate("/login");
    };

    useEffect(() => {
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, []);

    const menuItems = [
        {
            icon: "fas fa-user",
            label: "Profile",
            path: "/profile",
            color: "text-blue-600 dark:text-blue-400"
        },
        {
            icon: "fas fa-cog",
            label: "Settings",
            path: "/settings",
            color: "text-slate-600 dark:text-slate-400"
        },
        {
            icon: theme === "dark" ? "fas fa-sun" : "fas fa-moon",
            label: theme === "dark" ? "Light Mode" : "Dark Mode",
            action: toggleTheme,
            color: "text-amber-600 dark:text-amber-400"
        },
        {
            icon: "fas fa-sign-out-alt",
            label: "Logout",
            action: handleLogout,
            color: "text-red-600 dark:text-red-400",
            divider: true
        }
    ];

    return (
        <div className="relative" ref={dropdownRef}>
            {/* User Avatar Button */}
            <button
                onClick={toggleDropdown}
                className={`relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${isOpen ? "bg-slate-100 dark:bg-slate-800" : ""
                    }`}
                aria-label="User menu"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-6 w-6 transition-colors duration-200 ${isOpen
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-slate-600 dark:text-slate-200"
                        }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5.121 17.804A9.003 9.003 0 0112 15a9.003 9.003 0 016.879 2.804M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                </svg>

                {/* Dropdown indicator */}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`absolute -bottom-1 -right-1 h-3 w-3 transition-all duration-200 ${isOpen
                            ? "text-blue-600 dark:text-blue-400 rotate-180"
                            : "text-slate-600 dark:text-slate-200"
                        }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute right-0 mt-3 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
                    {/* Header */}
                    <div className="px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                                <i className="fas fa-user text-white text-lg"></i>
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-white">User Name</h3>
                                <p className="text-xs text-blue-100 dark:text-blue-200">user@lawfirm.com</p>
                            </div>
                        </div>
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                        {menuItems.map((item, index) => (
                            <div key={index}>
                                {item.divider && (
                                    <div className="my-2 border-t border-slate-200 dark:border-slate-700"></div>
                                )}
                                <button
                                    onClick={() => {
                                        if (item.action) {
                                            item.action();
                                        } else if (item.path) {
                                            handleNavigation(item.path);
                                        }
                                    }}
                                    className="w-full px-6 py-3 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200 group"
                                >
                                    <div className={`flex-shrink-0 ${item.color}`}>
                                        <i className={`${item.icon} text-lg`}></i>
                                    </div>
                                    <span className="flex-1 text-left text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white">
                                        {item.label}
                                    </span>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-4 w-4 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}