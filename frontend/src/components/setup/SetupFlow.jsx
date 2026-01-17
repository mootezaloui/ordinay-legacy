
import React, { useState } from 'react';
import { useSetup } from '../../contexts/SetupContext';
import { useOperator } from '../../contexts/OperatorContext';
import { updateOperator, getCurrentOperator } from '../../services/api/operators';
import { useLock } from '../../contexts/lockContext';

// ============================================================================
// USE REAL SETUP CONTEXT
// ============================================================================

// ============================================================================
// SETUP FLOW COMPONENT
// ============================================================================

const { completeSetup } = useSetup();
const { refetchOperator } = useOperator();
const { enableLock } = useLock();
const [step, setStep] = useState(1);
const [formData, setFormData] = useState({
    // Operator Profile
    firstName: '',
    lastName: '',
    role: '',
    email: '',
    phone: '',
    specialization: '',
    barNumber: '',

    // Firm Info
    firmName: '',
    firmAddress: '',
    firmPhone: '',
    jurisdiction: '',

    // Security
    enableLock: false,
    lockOnStartup: false,
    inactivityTimeout: 15,
    password: '',
    confirmPassword: ''
});

const [errors, setErrors] = useState({});

const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: '' }));
    }
};

const validateStep1 = () => {
    const newErrors = {};

    if (!formData.firstName.trim()) {
        newErrors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
        newErrors.lastName = 'Last name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
};

const validateStep3 = () => {
    if (!formData.enableLock) return true;

    const newErrors = {};

    if (!formData.password) {
        newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
        newErrors.password = 'Password must be at least 6 characters';
    }

    if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
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
    // Save operator data to backend
    const operatorUpdate = {
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email,
        phone: formData.phone,
        role: formData.role || 'Principal Lawyer',
        specialization: formData.specialization,
        bar_number: formData.barNumber,
        office: formData.firmAddress,
        bio: ''
    };

    try {
        // Get current operator to obtain ID
        const currentOperator = await getCurrentOperator();
        await updateOperator(currentOperator.id, operatorUpdate);
        // Optionally, save firm info and lock config as before (localStorage or API if available)
        // Save firm info (still localStorage unless backend endpoint exists)
        if (formData.firmName) {
            const firmData = {
                name: formData.firmName,
                address: formData.firmAddress,
                phone: formData.firmPhone,
                jurisdiction: formData.jurisdiction
            };
            localStorage.setItem('firm_info', JSON.stringify(firmData));
        }
        // Save lock settings using context so lock is actually enabled
        if (formData.enableLock) {
            enableLock(formData.password, formData.lockOnStartup, formData.inactivityTimeout);
        }
        // Refresh operator context
        await refetchOperator();
        // Mark workspace as initialized
        completeSetup();
    } catch (error) {
        console.error('Setup failed:', error);
        setErrors({ general: 'Failed to complete setup. Please try again.' });
    }
};

return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
                    <i className="fas fa-building text-white text-2xl"></i>
                </div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                    Welcome to Organia
                </h1>
                <p className="text-slate-600 dark:text-slate-400">
                    Let's set up your workspace in a few simple steps
                </p>
            </div>

            {/* Progress Indicator */}
            <div className="flex items-center justify-center mb-8">
                {[1, 2, 3].map((s) => (
                    <React.Fragment key={s}>
                        <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${s === step
                            ? 'bg-blue-600 text-white'
                            : s < step
                                ? 'bg-green-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                            }`}>
                            {s < step ? <i className="fas fa-check"></i> : s}
                        </div>
                        {s < 3 && (
                            <div className={`w-16 h-1 ${s < step ? 'bg-green-600' : 'bg-slate-200 dark:bg-slate-700'
                                }`}></div>
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Main Card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
                {errors.general && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                        {errors.general}
                    </div>
                )}

                {/* Step 1: Operator Profile */}
                {step === 1 && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                                Your Profile
                            </h2>
                            <p className="text-slate-600 dark:text-slate-400">
                                Tell us about yourself to personalize your workspace
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    First Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.firstName}
                                    onChange={(e) => handleChange('firstName', e.target.value)}
                                    className={`w-full px-4 py-3 border ${errors.firstName
                                        ? 'border-red-300 dark:border-red-600'
                                        : 'border-slate-300 dark:border-slate-600'
                                        } rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                    placeholder="John"
                                />
                                {errors.firstName && (
                                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.firstName}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Last Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.lastName}
                                    onChange={(e) => handleChange('lastName', e.target.value)}
                                    className={`w-full px-4 py-3 border ${errors.lastName
                                        ? 'border-red-300 dark:border-red-600'
                                        : 'border-slate-300 dark:border-slate-600'
                                        } rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                    placeholder="Doe"
                                />
                                {errors.lastName && (
                                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.lastName}</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Professional Title
                            </label>
                            <input
                                type="text"
                                value={formData.role}
                                onChange={(e) => handleChange('role', e.target.value)}
                                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g., Senior Attorney, Legal Consultant"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => handleChange('email', e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="john.doe@example.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Phone
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => handleChange('phone', e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="+216 XX XXX XXX"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Specialization
                                </label>
                                <input
                                    type="text"
                                    value={formData.specialization}
                                    onChange={(e) => handleChange('specialization', e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., Corporate Law"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Bar Number
                                </label>
                                <input
                                    type="text"
                                    value={formData.barNumber}
                                    onChange={(e) => handleChange('barNumber', e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="ABC123456"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Firm Information */}
                {step === 2 && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                                Firm Information
                            </h2>
                            <p className="text-slate-600 dark:text-slate-400">
                                Optional: Add details about your practice or firm
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Firm / Practice Name
                            </label>
                            <input
                                type="text"
                                value={formData.firmName}
                                onChange={(e) => handleChange('firmName', e.target.value)}
                                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Law Firm & Associates"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Address
                            </label>
                            <textarea
                                value={formData.firmAddress}
                                onChange={(e) => handleChange('firmAddress', e.target.value)}
                                rows="3"
                                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="123 Main Street, City, Country"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Firm Phone
                                </label>
                                <input
                                    type="tel"
                                    value={formData.firmPhone}
                                    onChange={(e) => handleChange('firmPhone', e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="+216 XX XXX XXX"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Jurisdiction
                                </label>
                                <input
                                    type="text"
                                    value={formData.jurisdiction}
                                    onChange={(e) => handleChange('jurisdiction', e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., Tunisia"
                                />
                            </div>
                        </div>

                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                                <i className="fas fa-info-circle mr-2"></i>
                                You can skip this step and add firm details later in Settings
                            </p>
                        </div>
                    </div>
                )}

                {/* Step 3: Security */}
                {step === 3 && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                                Workspace Security
                            </h2>
                            <p className="text-slate-600 dark:text-slate-400">
                                Protect your workspace with a password lock
                            </p>
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                            <div className="flex items-start gap-3">
                                <button
                                    onClick={() => handleChange('enableLock', !formData.enableLock)}
                                    className={`mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.enableLock ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                                        }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.enableLock ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                </button>
                                <div>
                                    <p className="font-medium text-slate-900 dark:text-white">
                                        Enable workspace lock
                                    </p>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                        Require a password to access your workspace
                                    </p>
                                </div>
                            </div>
                        </div>

                        {formData.enableLock && (
                            <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Password <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => handleChange('password', e.target.value)}
                                        className={`w-full px-4 py-3 border ${errors.password
                                            ? 'border-red-300 dark:border-red-600'
                                            : 'border-slate-300 dark:border-slate-600'
                                            } rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                        placeholder="Min. 6 characters"
                                    />
                                    {errors.password && (
                                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Confirm Password <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.confirmPassword}
                                        onChange={(e) => handleChange('confirmPassword', e.target.value)}
                                        className={`w-full px-4 py-3 border ${errors.confirmPassword
                                            ? 'border-red-300 dark:border-red-600'
                                            : 'border-slate-300 dark:border-slate-600'
                                            } rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                        placeholder="Re-enter password"
                                    />
                                    {errors.confirmPassword && (
                                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.confirmPassword}</p>
                                    )}
                                </div>

                                <div className="flex items-center justify-between py-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Lock on startup
                                    </label>
                                    <button
                                        onClick={() => handleChange('lockOnStartup', !formData.lockOnStartup)}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${formData.lockOnStartup ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${formData.lockOnStartup ? 'translate-x-5' : 'translate-x-1'
                                                }`}
                                        />
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Inactivity timeout (minutes, 0 to disable)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="120"
                                        value={formData.inactivityTimeout}
                                        onChange={(e) => handleChange('inactivityTimeout', parseInt(e.target.value) || 0)}
                                        className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        )}

                        {!formData.enableLock && (
                            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                <p className="text-sm text-amber-700 dark:text-amber-300">
                                    <i className="fas fa-exclamation-triangle mr-2"></i>
                                    Without a lock, anyone with access to this device can view your workspace data
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <div>
                        {step > 1 && (
                            <button
                                onClick={handleBack}
                                className="px-6 py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
                            >
                                <i className="fas fa-arrow-left mr-2"></i>
                                Back
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {step === 2 && (
                            <button
                                onClick={handleSkipStep}
                                className="px-6 py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
                            >
                                Skip
                            </button>
                        )}

                        <button
                            onClick={handleNext}
                            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            {step === 3 ? (
                                <>
                                    <i className="fas fa-check"></i>
                                    Complete Setup
                                </>
                            ) : (
                                <>
                                    Next
                                    <i className="fas fa-arrow-right"></i>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="text-center mt-6 text-sm text-slate-500 dark:text-slate-400">
                All data is stored locally on your device
            </div>
        </div>
    </div>
);
}

// Remove demo app and root component export. SetupFlow is now a pure form component.
export default SetupFlow;