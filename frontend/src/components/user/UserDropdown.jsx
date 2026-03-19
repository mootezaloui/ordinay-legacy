import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../contexts/ThemeProvider";
import { useTranslation } from "react-i18next";
import { useOperator } from "../../contexts/OperatorContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "../ui/sheet";

/**
 * UserDropdown Component
 * Matches the style of NotificationDropdown
 */
export default function UserDropdown({ isOpen, onToggle, onClose }) {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const { operator } = useOperator();
    const dropdownRef = useRef(null);
    const { t } = useTranslation("common");
    const [isMobile, setIsMobile] = useState(false);

    const toggleDropdown = (e) => {
        e.stopPropagation();
        onToggle();
    };

    const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            onClose();
        }
    };

    const handleNavigation = (path) => {
        onClose();
        navigate(path);
    };

    useEffect(() => {
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, []);

    useEffect(() => {
        const updateIsMobile = () => {
            setIsMobile(window.matchMedia("(max-width: 767px)").matches);
        };
        updateIsMobile();
        window.addEventListener("resize", updateIsMobile);
        return () => window.removeEventListener("resize", updateIsMobile);
    }, []);

    const menuItems = [
        {
            icon: "fas fa-user",
            label: t("header.userMenu.profile"),
            path: "/profile",
            color: "text-blue-600 dark:text-blue-400"
        },
        {
            icon: "fas fa-cog",
            label: t("header.userMenu.settings"),
            path: "/settings",
            color: "text-slate-600 dark:text-slate-400"
        },
        {
            icon: theme === "dark" ? "fas fa-sun" : "fas fa-moon",
            label: theme === "dark" ? t("header.userMenu.lightMode") : t("header.userMenu.darkMode"),
            action: toggleTheme,
            color: "text-amber-600 dark:text-amber-400"
        },

    ];

    const avatarButton = (
        <button
            onClick={toggleDropdown}
            className={`relative p-2.5 rounded-full border border-transparent hover:border-slate-200/80 dark:hover:border-slate-700/70 hover:bg-white/80 dark:hover:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/60 transition-all duration-200 ${isOpen ? "bg-white/90 dark:bg-slate-900/70 border-slate-200/80 dark:border-slate-700/70 shadow-sm" : ""
                }`}
            aria-label={t("aria.userDropdown.userMenu", { ns: "common" })}
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
    );

    const menuList = (
        <div className="py-2">
            {menuItems.map((item, index) => (
                <div key={index}>
                    {item.divider && (
                        <div className="my-2 border-t border-slate-200/70 dark:border-slate-700/60"></div>
                    )}
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (item.action) {
                                item.action(e);
                            } else if (item.path) {
                                handleNavigation(item.path);
                            }
                        }}
                        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 transition-colors duration-200 group"
                    >
                        <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center ${item.color}`}>
                            <i className={`${item.icon} text-base`}></i>
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
    );

    return (
        <div className="relative" ref={dropdownRef}>
            {avatarButton}

            {isMobile ? (
                <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
                    <SheetContent side="right" className="w-full sm:max-w-full">
                        <SheetHeader className="flex flex-row items-center justify-between">
                            <SheetTitle>{t("header.userMenu.profile")}</SheetTitle>
                            <SheetClose className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                                <i className="fas fa-times"></i>
                            </SheetClose>
                        </SheetHeader>
                        <div className="mt-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 overflow-hidden">
                            <div className="px-5 py-4 bg-slate-50/90 dark:bg-slate-800/70 border-b border-slate-200/70 dark:border-slate-700/60">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                                        <i className="fas fa-user text-white text-lg"></i>
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{operator?.name || "User Name"}</h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                            {operator?.role ? t(`header.roles.${operator.role}`, { defaultValue: operator.role }) : "Operator"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {menuList}
                        </div>
                    </SheetContent>
                </Sheet>
            ) : (
                <div
                    className={`absolute right-0 mt-3 w-72 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-700/70 overflow-hidden z-50 shadow-2xl ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
                    style={{
                        clipPath: isOpen ? "circle(150% at 90% 0%)" : "circle(0% at 90% 0%)",
                        transition: isOpen
                            ? "clip-path 420ms cubic-bezier(0.34, 1.3, 0.64, 1)"
                            : "clip-path 220ms cubic-bezier(0.4, 0, 1, 1)",
                    }}
                >
                        <div className="px-5 py-4 bg-slate-50/90 dark:bg-slate-800/70 border-b border-slate-200/70 dark:border-slate-700/60">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                                    <i className="fas fa-user text-white text-lg"></i>
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{operator?.name || "User Name"}</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                        {operator?.role ? t(`header.roles.${operator.role}`, { defaultValue: operator.role }) : "Operator"}
                                    </p>
                                </div>
                            </div>
                        </div>
                        {menuList}
                    </div>
            )}
        </div>
    );
}
