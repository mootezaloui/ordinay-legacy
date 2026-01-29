import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSetup } from "../../contexts/SetupContext";
import { useOperator } from "../../contexts/OperatorContext";
import { updateOperatorForSetup, getCurrentOperator } from "../../services/api/operators";
import { useLock } from "../../contexts/LockContext";

function SetupFlow() {
    const { t } = useTranslation("setupflow");
    const { completeSetup } = useSetup();
    const { refetchOperator } = useOperator();
    const { enableLock } = useLock();
    const [step, setStep] = useState(1);
    const [isAnimating, setIsAnimating] = useState(false);
    const [slideDirection, setSlideDirection] = useState("right");
    const [mounted, setMounted] = useState(false);
    const prevStep = useRef(step);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (prevStep.current !== step) {
            setSlideDirection(step > prevStep.current ? "right" : "left");
            setIsAnimating(true);
            const timer = setTimeout(() => setIsAnimating(false), 300);
            prevStep.current = step;
            return () => clearTimeout(timer);
        }
    }, [step]);

    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        role: "",
        email: "",
        phone: "",
        specialization: "",
        firmName: "",
        firmAddress: "",
        firmPhone: "",
        jurisdiction: "",
        enableLock: false,
        lockOnStartup: false,
        inactivityTimeout: 15,
        password: "",
        confirmPassword: "",
    });

    const [errors, setErrors] = useState({});
    const totalSteps = 3;

    const handleChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: "" }));
        }
    };

    const validateStep1 = () => {
        const newErrors = {};

        if (!formData.firstName.trim()) {
            newErrors.firstName = t("errors.firstNameRequired");
        }
        if (!formData.lastName.trim()) {
            newErrors.lastName = t("errors.lastNameRequired");
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const validateStep3 = () => {
        if (!formData.enableLock) return true;

        const newErrors = {};

        if (!formData.password) {
            newErrors.password = t("errors.passwordRequired");
        } else if (formData.password.length < 6) {
            newErrors.password = t("errors.passwordTooShort");
        }

        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = t("errors.passwordMismatch");
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
        if (step === 1 && !validateStep1()) return;
        if (step === 3 && !validateStep3()) return;

        if (step < 3) {
            setStep(step + 1);
        } else {
            handleComplete();
        }
    };

    const handleBack = () => {
        if (step > 1) setStep(step - 1);
    };

    const handleSkipStep = () => {
        if (step === 2) {
            setStep(3);
        }
    };

    const handleComplete = async () => {
        const operatorUpdate = {
            name: `${formData.firstName} ${formData.lastName}`.trim(),
            email: formData.email,
            phone: formData.phone,
            role: formData.role || "Principal Lawyer",
            specialization: formData.specialization,
            office: formData.firmAddress,
            bio: "",
        };

        try {
            const currentOperator = await getCurrentOperator();
            await updateOperatorForSetup(currentOperator.id, operatorUpdate);
            if (formData.firmName) {
                const firmData = {
                    name: formData.firmName,
                    address: formData.firmAddress,
                    phone: formData.firmPhone,
                    jurisdiction: formData.jurisdiction,
                };
                localStorage.setItem("firm_info", JSON.stringify(firmData));
            }
            if (formData.enableLock) {
                enableLock(
                    formData.password,
                    formData.lockOnStartup,
                    formData.inactivityTimeout
                );
            }
            await refetchOperator();
            completeSetup();
        } catch (error) {
            console.error("Setup failed:", error);
            setErrors({ general: t("errors.general") });
        }
    };

    const stepTitles = {
        1: { title: t("steps.profile.title"), subtitle: t("steps.profile.subtitle") },
        2: { title: t("steps.firm.title"), subtitle: t("steps.firm.subtitle") },
        3: { title: t("steps.security.title"), subtitle: t("steps.security.subtitle") },
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-start md:items-center justify-center px-4 sm:px-6 md:px-8 pt-6 sm:pt-10 pb-8 titlebar-offset-padding overflow-y-auto">
            {/* CSS Animations */}
            <style>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(30px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes slideInLeft {
                    from { opacity: 0; transform: translateX(-30px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes pulse-subtle {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
                    50% { box-shadow: 0 0 0 8px rgba(59, 130, 246, 0); }
                }
                .animate-fade-in-up { animation: fadeInUp 0.6s ease-out forwards; }
                .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
                .animate-slide-in-right { animation: slideInRight 0.35s ease-out forwards; }
                .animate-slide-in-left { animation: slideInLeft 0.35s ease-out forwards; }
                .animate-scale-in { animation: scaleIn 0.4s ease-out forwards; }
                .animate-pulse-subtle { animation: pulse-subtle 2s ease-in-out infinite; }
                .stagger-1 { animation-delay: 0.05s; }
                .stagger-2 { animation-delay: 0.1s; }
                .stagger-3 { animation-delay: 0.15s; }
                .stagger-4 { animation-delay: 0.2s; }
                .stagger-5 { animation-delay: 0.25s; }
            `}</style>

            <div className={`w-full max-w-6xl transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
                <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6 lg:gap-10 items-start lg:items-center">
                    {/* Left Panel - Branding & Progress */}
                    <div className={`lg:sticky lg:top-8 space-y-6 lg:space-y-8 text-slate-900 dark:text-slate-100 lg:pr-6 lg:border-r lg:border-slate-200 dark:lg:border-slate-800/60 pb-6 lg:pb-0 border-b border-slate-200 dark:border-slate-800/60 lg:border-b-0 ${mounted ? "animate-fade-in-up" : "opacity-0"}`}>
                        <div>
                            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl mb-6 shadow-lg shadow-blue-500/20 transition-transform duration-300 hover:scale-105">
                                <i className="fas fa-scale-balanced text-slate-900 dark:text-white text-xl"></i>
                            </div>
                            <h1 className="text-2xl font-semibold mb-2 tracking-tight">{t("intro.title")}</h1>
                            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                                {t("intro.subtitle")}
                            </p>
                        </div>

                        {/* Progress Steps - Vertical */}
                        <div className="flex gap-4 lg:block lg:space-y-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
                            {[
                                { num: 1, label: t("progress.labels.profile") },
                                { num: 2, label: t("progress.labels.firm") },
                                { num: 3, label: t("progress.labels.security") },
                            ].map((s, idx) => (
                                <div key={s.num} className="flex flex-col items-center lg:flex-row lg:items-start gap-2 lg:gap-4 min-w-[96px]">
                                    <div className="flex flex-col items-center">
                                        <div
                                            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-all duration-300 ${s.num === step
                                                ? "bg-blue-600 text-white ring-4 ring-blue-600/20 animate-pulse-subtle"
                                                : s.num < step
                                                    ? "bg-emerald-500/90 text-white scale-100"
                                                    : "bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700"
                                                }`}
                                        >
                                            {s.num < step ? (
                                                <i className="fas fa-check text-xs transition-transform duration-200"></i>
                                            ) : s.num}
                                        </div>
                                        {idx < 2 && (
                                            <div
                                                className={`hidden lg:block w-0.5 h-8 mt-1 rounded-full transition-all duration-500 ${s.num < step ? "bg-emerald-500/60" : "bg-slate-200 dark:bg-slate-800"
                                                    }`}
                                            />
                                        )}
                                    </div>
                                    <div className="pt-1.5 text-center lg:text-left">
                                        <p className={`text-sm font-medium transition-colors duration-300 ${s.num === step ? "text-slate-900 dark:text-white" : s.num < step ? "text-slate-600 dark:text-slate-300" : "text-slate-600 dark:text-slate-500"}`}>
                                            {s.label}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-500 pt-4 border-t border-slate-200 dark:border-slate-800">
                            {t("progress.localDataNote")}
                        </p>
                    </div>

                    {/* Right Panel - Form Card */}
                    <div className={`flex flex-col w-full max-w-9xl lg:ml-6 mt-2 lg:mt-3 bg-white/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/60 rounded-2xl overflow-hidden shadow-sm dark:shadow-none ${mounted ? "animate-scale-in" : "opacity-0"}`} style={{ animationDelay: "0.15s" }}>
                        {/* Card Header */}
                        <div className="px-4 sm:px-6 md:px-10 pt-4 md:pt-6 pb-3 md:pb-4 border-b border-slate-200 dark:border-slate-800/40">
                            <div key={step} className={`space-y-3 ${slideDirection === "right" ? "animate-slide-in-right" : "animate-slide-in-left"}`}>
                                <div className="flex flex-wrap items-baseline gap-3">
                                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                        {t("progress.stepOf", { step, total: totalSteps })}
                                    </p>
                                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                                        {stepTitles[step].title}
                                    </h2>
                                </div>
                                <div className="flex items-start justify-between gap-4">
                                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                                        {stepTitles[step].subtitle}
                                    </p>
                                    {step === 2 && (
                                        <span className="text-xs text-slate-600 dark:text-slate-500 bg-slate-200/70 dark:bg-slate-800/80 px-3 py-1.5 rounded-full animate-fade-in">
                                            {t("badges.optional")}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Card Body */}
                        <div className="px-4 sm:px-6 md:px-10 py-3 md:py-5">
                            {errors.general && (
                                <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-600 dark:text-red-300 text-sm mb-8">
                                    {errors.general}
                                </div>
                            )}

                            {step === 1 && (
                                <div key="step1" className={`space-y-8 ${slideDirection === "right" ? "animate-slide-in-right" : "animate-slide-in-left"}`}>
                                    {/* Required Fields Group */}
                                    <div className="space-y-5 opacity-0 animate-fade-in stagger-1">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("sections.requiredInfo")}</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="group">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                                    {t("fields.firstName.label")}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.firstName}
                                                    onChange={(e) => handleChange("firstName", e.target.value)}
                                                    className={`w-full px-4 py-2.5 border ${errors.firstName
                                                        ? "border-red-300 bg-red-50 dark:border-red-400/60 dark:bg-red-500/5"
                                                        : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
                                                        } rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200`}
                                                    placeholder={t("fields.firstName.placeholder")}
                                                />
                                                {errors.firstName && (
                                                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 animate-fade-in">{errors.firstName}</p>
                                                )}
                                            </div>
                                            <div className="group">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                                    {t("fields.lastName.label")}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.lastName}
                                                    onChange={(e) => handleChange("lastName", e.target.value)}
                                                    className={`w-full px-4 py-2.5 border ${errors.lastName
                                                        ? "border-red-300 bg-red-50 dark:border-red-400/60 dark:bg-red-500/5"
                                                        : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
                                                        } rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200`}
                                                    placeholder={t("fields.lastName.placeholder")}
                                                />
                                                {errors.lastName && (
                                                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 animate-fade-in">{errors.lastName}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Professional Details Group */}
                                    <div className="space-y-5 opacity-0 animate-fade-in stagger-2">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("sections.professionalDetails")}</p>
                                        <div className="group">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                                {t("fields.role.label")}
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.role}
                                                onChange={(e) => handleChange("role", e.target.value)}
                                                className="w-full px-4 py-2.5 border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200"
                                                placeholder={t("fields.role.placeholder")}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="group">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                                    {t("fields.specialization.label")}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.specialization}
                                                    onChange={(e) => handleChange("specialization", e.target.value)}
                                                    className="w-full px-4 py-2.5 border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200"
                                                    placeholder={t("fields.specialization.placeholder")}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Contact Details Group */}
                                    <div className="space-y-5 opacity-0 animate-fade-in stagger-3">
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("sections.contactInformation")}</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="group">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                                    {t("fields.email.label")}
                                                </label>
                                                <input
                                                    type="email"
                                                    value={formData.email}
                                                    onChange={(e) => handleChange("email", e.target.value)}
                                                    className="w-full px-4 py-2.5 border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200"
                                                    placeholder={t("fields.email.placeholder")}
                                                />
                                            </div>
                                            <div className="group">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                                    {t("fields.phone.label")}
                                                </label>
                                                <input
                                                    type="tel"
                                                    value={formData.phone}
                                                    onChange={(e) => handleChange("phone", e.target.value)}
                                                    className="w-full px-4 py-2.5 border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200"
                                                    placeholder={t("fields.phone.placeholder")}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-xs text-slate-500 dark:text-slate-500 flex items-center gap-2 opacity-0 animate-fade-in stagger-4">
                                        <i className="fas fa-pen text-slate-600"></i>
                                        {t("hints.editLater")}
                                    </p>
                                </div>
                            )}

                            {step === 2 && (
                                <div key="step2" className={`space-y-6 ${slideDirection === "right" ? "animate-slide-in-right" : "animate-slide-in-left"}`}>
                                    <div className="group opacity-0 animate-fade-in stagger-1">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                            {t("fields.firmName.label")}
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.firmName}
                                            onChange={(e) => handleChange("firmName", e.target.value)}
                                            className="w-full px-4 py-2.5 border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200"
                                            placeholder={t("fields.firmName.placeholder")}
                                        />
                                    </div>

                                    <div className="group opacity-0 animate-fade-in stagger-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                            {t("fields.firmAddress.label")}
                                        </label>
                                        <textarea
                                            value={formData.firmAddress}
                                            onChange={(e) => handleChange("firmAddress", e.target.value)}
                                            rows="2"
                                            className="w-full px-4 py-2.5 border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200 resize-none"
                                            placeholder={t("fields.firmAddress.placeholder")}
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 opacity-0 animate-fade-in stagger-3">
                                        <div className="group">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                                {t("fields.firmPhone.label")}
                                            </label>
                                            <input
                                                type="tel"
                                                value={formData.firmPhone}
                                                onChange={(e) => handleChange("firmPhone", e.target.value)}
                                                className="w-full px-4 py-2.5 border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200"
                                                placeholder={t("fields.firmPhone.placeholder")}
                                            />
                                        </div>
                                        <div className="group">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                                {t("fields.jurisdiction.label")}
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.jurisdiction}
                                                onChange={(e) => handleChange("jurisdiction", e.target.value)}
                                                className="w-full px-4 py-2.5 border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200"
                                                placeholder={t("fields.jurisdiction.placeholder")}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-500 pt-2 opacity-0 animate-fade-in stagger-4">
                                        <i className="fas fa-info-circle text-slate-600 mt-0.5"></i>
                                        <span>{t("hints.skipFirm")}</span>
                                    </div>
                                </div>
                            )}

                            {step === 3 && (
                                <div key="step3" className={`space-y-6 ${slideDirection === "right" ? "animate-slide-in-right" : "animate-slide-in-left"}`}>
                                    {/* Enable Lock Toggle */}
                                    <div
                                        onClick={() => handleChange("enableLock", !formData.enableLock)}
                                        className={`p-5 rounded-xl border cursor-pointer transition-all duration-300 opacity-0 animate-fade-in stagger-1 ${formData.enableLock
                                            ? "bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30"
                                            : "bg-slate-100 border-slate-200 hover:border-slate-300 hover:bg-slate-200/60 dark:bg-slate-800/30 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800/50"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300 ${formData.enableLock ? "bg-blue-500/20" : "bg-slate-200 dark:bg-slate-700/50"}`}>
                                                    <i className={`fas fa-lock text-sm transition-colors duration-300 ${formData.enableLock ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-500"}`}></i>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{t("lock.enable.title")}</p>
                                                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                                                        {t("lock.enable.description")}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${formData.enableLock
                                                    ? "bg-blue-600"
                                                    : "bg-slate-300 dark:bg-slate-600"
                                                    }`}
                                            >
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${formData.enableLock ? "translate-x-6" : "translate-x-1"
                                                        }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {formData.enableLock && (
                                        <div className="space-y-6 pt-2 animate-fade-in">
                                            {/* Warning */}
                                            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-500/5 dark:border-amber-500/20 opacity-0 animate-fade-in stagger-1">
                                                <i className="fas fa-triangle-exclamation text-amber-500 mt-0.5"></i>
                                                <p className="text-xs text-amber-700 dark:text-amber-200/90 leading-relaxed">
                                                    {t("lock.warning")}
                                                </p>
                                            </div>

                                            {/* Password Fields */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 opacity-0 animate-fade-in stagger-2">
                                                <div className="group">
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                                        {t("fields.password.label")}
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={formData.password}
                                                        onChange={(e) => handleChange("password", e.target.value)}
                                                        className={`w-full px-4 py-2.5 border ${errors.password ? "border-red-300 bg-red-50 dark:border-red-400/60 dark:bg-red-500/5" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
                                                            } rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200`}
                                                        placeholder={t("fields.password.placeholder")}
                                                    />
                                                    {errors.password && (
                                                        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 animate-fade-in">{errors.password}</p>
                                                    )}
                                                </div>
                                                <div className="group">
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400">
                                                        {t("fields.confirmPassword.label")}
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={formData.confirmPassword}
                                                        onChange={(e) => handleChange("confirmPassword", e.target.value)}
                                                        className={`w-full px-4 py-2.5 border ${errors.confirmPassword
                                                            ? "border-red-300 bg-red-50 dark:border-red-400/60 dark:bg-red-500/5"
                                                            : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
                                                            } rounded-lg text-slate-900 placeholder-slate-400 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200`}
                                                        placeholder={t("fields.confirmPassword.placeholder")}
                                                    />
                                                    {errors.confirmPassword && (
                                                        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 animate-fade-in">{errors.confirmPassword}</p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Lock Options */}
                                            <div className="space-y-4 pt-2 opacity-0 animate-fade-in stagger-3">
                                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{t("lock.options.title")}</p>

                                                <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-800 transition-colors hover:border-slate-300 dark:hover:border-slate-700">
                                                    <div>
                                                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("lock.options.lockOnStartup.title")}</p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{t("lock.options.lockOnStartup.description")}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleChange("lockOnStartup", !formData.lockOnStartup)}
                                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${formData.lockOnStartup
                                                            ? "bg-blue-600"
                                                            : "bg-slate-300 dark:bg-slate-600"
                                                            }`}
                                                    >
                                                        <span
                                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${formData.lockOnStartup ? "translate-x-6" : "translate-x-1"
                                                                }`}
                                                        />
                                                    </button>
                                                </div>

                                                <div className="flex items-center justify-between py-3">
                                                    <div>
                                                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("lock.options.inactivityTimeout.title")}</p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{t("lock.options.inactivityTimeout.description")}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="120"
                                                            value={formData.inactivityTimeout}
                                                            onChange={(e) =>
                                                                handleChange("inactivityTimeout", parseInt(e.target.value) || 0)
                                                            }
                                                            className="w-20 px-3 py-1.5 border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 rounded-lg text-slate-900 dark:text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all duration-200"
                                                        />
                                                        <span className="text-xs text-slate-500">{t("units.minutesShort")}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {!formData.enableLock && (
                                        <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-100 border border-slate-200 dark:bg-slate-800/40 dark:border-slate-700/50 opacity-0 animate-fade-in stagger-2">
                                            <i className="fas fa-info-circle text-slate-500 dark:text-slate-500 mt-0.5"></i>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                                {t("lock.disabledNotice")}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Card Footer */}
                        <div className="px-4 sm:px-6 md:px-10 py-2 md:py-3 border-t border-slate-200 dark:border-slate-800/40 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="w-full sm:w-auto">
                                {step > 1 && (
                                    <button
                                        onClick={handleBack}
                                        className="w-full sm:w-auto px-4 py-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-sm font-medium transition-all duration-200 flex items-center justify-center sm:justify-start gap-2 hover:-translate-x-0.5 active:scale-95"
                                    >
                                        <i className="fas fa-arrow-left text-xs transition-transform group-hover:-translate-x-1"></i>
                                        {t("actions.back")}
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-3 w-full sm:w-auto">


                                <button
                                    onClick={handleNext}
                                    className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 hover:translate-x-0.5 active:scale-95"
                                >
                                    {step === 3 ? (
                                        <>
                                            {t("actions.complete")}
                                            <i className="fas fa-check text-xs"></i>
                                        </>
                                    ) : (
                                        <>
                                            {t("actions.continue")}
                                            <i className="fas fa-arrow-right text-xs"></i>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SetupFlow;
