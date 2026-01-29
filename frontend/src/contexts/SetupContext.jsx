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

    useEffect(() => {
        if (isInitialized !== null) {
            const splash = window.__ordinaySplash;
            if (splash && typeof splash.markReady === 'function') {
                splash.markReady('setup');
            }
        }
    }, [isInitialized]);

    if (isInitialized === null) {
        return null;
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
