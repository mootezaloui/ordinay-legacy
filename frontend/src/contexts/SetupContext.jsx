import { createContext, useContext, useState, useEffect } from 'react';

const SetupContext = createContext(null);

export function SetupProvider({ children }) {
    const [isInitialized, setIsInitialized] = useState(null);

    useEffect(() => {
        const initialized = localStorage.getItem('workspace_initialized');
        setIsInitialized(initialized === 'true');
    }, []);

    const completeSetup = () => {
        localStorage.setItem('workspace_initialized', 'true');
        setIsInitialized(true);
    };

    if (isInitialized === null) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <div className="text-slate-600 dark:text-slate-400">Loading workspace...</div>
            </div>
        );
    }

    return (
        <SetupContext.Provider value={{ isInitialized, completeSetup }}>
            {children}
        </SetupContext.Provider>
    );
}

export function useSetup() {
    const context = useContext(SetupContext);
    if (!context) throw new Error('useSetup must be used within SetupProvider');
    return context;
}