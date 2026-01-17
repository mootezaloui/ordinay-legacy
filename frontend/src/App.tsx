import { useLock } from "./contexts/lockContext";
import { useSetup } from "./contexts/SetupContext";
import SetupFlow from "./components/setup/SetupFlow";
import { useInactivityLock } from "./hooks/useInactivityLock";
import LockScreen from "./components/lock/LockScreen";
import AppRouter from "./routes/AppRouter";
import { OnboardingTutorial } from "./components/onboarding";
import TutorialOverlay from "./components/tutorial/TutorialOverlay";

function App() {
  const { isLocked } = useLock();
  const { isInitialized, completeSetup } = useSetup();
  // Monitor user activity for inactivity lock
  useInactivityLock();

  if (!isInitialized) {
    return <SetupFlow onComplete={completeSetup} />;
  }

  // Render lock screen if workspace is locked
  // This is a complete gate - no app data is rendered behind it
  if (isLocked) {
    return <LockScreen />;
  }

  // Normal app flow
  return (
    <>
      <AppRouter />
      <OnboardingTutorial />
      <TutorialOverlay />
    </>
  );
}

export default App;
