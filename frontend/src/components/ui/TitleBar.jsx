import { useState, useEffect } from "react";
import { Minus, Square, X, Copy, Maximize2 } from "lucide-react";

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isHoveringControls, setIsHoveringControls] = useState(false);
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
      {/* Left section - Logo */}
      <div className="titlebar-left">
        <div className="titlebar-logo-container">
          <div className="titlebar-logo-glow" />
          <svg
            className="titlebar-logo"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Outer ring */}
            <circle
              cx="16"
              cy="16"
              r="13"
              className="titlebar-logo-ring-outer"
            />
            {/* Middle ring */}
            <circle
              cx="16"
              cy="16"
              r="9"
              className="titlebar-logo-ring-middle"
            />
            {/* Inner ring */}
            <circle
              cx="16"
              cy="16"
              r="5"
              className="titlebar-logo-ring-inner"
            />
            {/* Orbital dots */}
            <circle cx="16" cy="3" r="1.5" className="titlebar-logo-dot titlebar-logo-dot-1" />
            <circle cx="29" cy="16" r="1.5" className="titlebar-logo-dot titlebar-logo-dot-2" />
            <circle cx="16" cy="29" r="1.5" className="titlebar-logo-dot titlebar-logo-dot-3" />
            <circle cx="3" cy="16" r="1.5" className="titlebar-logo-dot titlebar-logo-dot-4" />
            {/* Center accent */}
            <circle cx="16" cy="16" r="2" className="titlebar-logo-center" />
          </svg>
        </div>
      </div>

      {/* Center section - App name (draggable) */}
      <div className="titlebar-center">
        <span className="titlebar-brand">
          <span className="titlebar-brand-o">O</span>
          <span className="titlebar-brand-text">rdinay</span>
        </span>
      </div>

      {/* Right section - Window controls */}
      <div
        className="titlebar-right"
        onMouseEnter={() => setIsHoveringControls(true)}
        onMouseLeave={() => setIsHoveringControls(false)}
      >
        <div className="titlebar-controls">
          <button
            className="titlebar-btn titlebar-btn-minimize"
            onClick={handleMinimize}
            aria-label="Minimize"
          >
            <Minus size={14} strokeWidth={2} />
          </button>
          <button
            className="titlebar-btn titlebar-btn-maximize"
            onClick={handleMaximize}
            aria-label={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Copy size={12} strokeWidth={2} />
            ) : (
              <Maximize2 size={12} strokeWidth={2} />
            )}
          </button>
          <button
            className="titlebar-btn titlebar-btn-close"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
