import { useState, useEffect } from "react";
import { Minus, Square, X, Copy } from "lucide-react";

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = !!window.electronAPI;

  useEffect(() => {
    if (!isElectron) return;

    // Add class to html element for CSS variable
    document.documentElement.classList.add("has-titlebar");

    const checkMaximized = async () => {
      const maximized = await window.electronAPI.windowIsMaximized();
      setIsMaximized(maximized);
    };

    checkMaximized();

    // Check on window resize
    const handleResize = () => checkMaximized();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      document.documentElement.classList.remove("has-titlebar");
    };
  }, [isElectron]);

  const handleMinimize = () => {
    if (isElectron) window.electronAPI.windowMinimize();
  };

  const handleMaximize = () => {
    if (isElectron) {
      window.electronAPI.windowMaximize();
      setIsMaximized(!isMaximized);
    }
  };

  const handleClose = () => {
    if (isElectron) window.electronAPI.windowClose();
  };

  // Don't render in browser mode
  if (!isElectron) return null;

  return (
    <div className="titlebar">
      {/* Drag region */}
      <div className="titlebar-drag" />

      {/* App identity */}
      <div className="titlebar-identity">
        <svg
          className="titlebar-logo"
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle className="titlebar-logo-ring" cx="16" cy="16" r="11" />
          <circle className="titlebar-logo-ring" cx="16" cy="16" r="8.5" />
          <circle className="titlebar-logo-ring" cx="16" cy="16" r="5.5" />
          <circle className="titlebar-logo-dot" cx="16" cy="6" r="1" />
          <circle className="titlebar-logo-dot" cx="26" cy="16" r="1" />
          <circle className="titlebar-logo-dot" cx="16" cy="26" r="1" />
          <circle className="titlebar-logo-dot" cx="6" cy="16" r="1" />
          <circle className="titlebar-logo-accent" cx="16" cy="16" r="1.5" />
        </svg>
        <span className="titlebar-name">rgania</span>
      </div>

      {/* Spacer */}
      <div className="titlebar-spacer" />

      {/* Window controls */}
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          onClick={handleMinimize}
          aria-label="Minimize"
        >
          <Minus size={12} />
        </button>
        <button
          className="titlebar-btn"
          onClick={handleMaximize}
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Copy size={12} /> : <Square size={10} />}
        </button>
        <button
          className="titlebar-btn titlebar-btn-close"
          onClick={handleClose}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
