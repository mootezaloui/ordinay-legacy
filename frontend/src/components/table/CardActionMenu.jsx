import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export default function CardActionMenu({ actions = [] }) {
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="h-11 w-11 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center transition-colors shadow-sm"
          aria-haspopup="menu"
          aria-label="More actions"
        >
          <i className="fas fa-ellipsis-h text-base"></i>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={6}
        collisionPadding={8}
        className="w-44 max-h-none overflow-y-visible"
      >
        {actions.map((action, idx) => {
          const label = action.title || action.icon || "Action";
          const isDestructive = action.variant === "delete" || action.icon === "delete";

          return (
            <DropdownMenuItem
              key={`${label}-${idx}`}
              className={isDestructive ? "text-red-600 dark:text-red-400 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20" : ""}
              onSelect={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (typeof action.onClick === "function") {
                  action.onClick({
                    stopPropagation: () => {},
                    preventDefault: () => {},
                  });
                }
              }}
            >
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
