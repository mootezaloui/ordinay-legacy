import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const actionIcons = {
  view: "fas fa-eye",
  edit: "fas fa-pen",
  delete: "fas fa-trash-alt",
  more: "fas fa-ellipsis-h",
};

export default function CardActionMenu({ actions = [] }) {
  if (actions.length === 0) return null;

  const normalActions = actions.filter(
    (a) => a.variant !== "delete" && a.icon !== "delete"
  );
  const destructiveActions = actions.filter(
    (a) => a.variant === "delete" || a.icon === "delete"
  );

  return (
    <DropdownMenu modal={false}>
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
        collisionPadding={16}
        className="min-w-[10rem] max-h-none overflow-y-visible"
        onClick={(e) => e.stopPropagation()}
      >
        {normalActions.map((action, idx) => {
          const label = action.title || action.icon || "Action";
          const iconClass = actionIcons[action.icon] || actionIcons.more;

          return (
            <DropdownMenuItem
              key={`${label}-${idx}`}
              onSelect={() => {
                if (typeof action.onClick === "function") {
                  action.onClick({
                    stopPropagation: () => {},
                    preventDefault: () => {},
                  });
                }
              }}
            >
              <i className={`${iconClass} w-4 text-center text-slate-400 dark:text-slate-500`}></i>
              <span>{label}</span>
            </DropdownMenuItem>
          );
        })}

        {normalActions.length > 0 && destructiveActions.length > 0 && (
          <DropdownMenuSeparator />
        )}

        {destructiveActions.map((action, idx) => {
          const label = action.title || action.icon || "Action";

          return (
            <DropdownMenuItem
              key={`destructive-${label}-${idx}`}
              className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
              onSelect={() => {
                if (typeof action.onClick === "function") {
                  action.onClick({
                    stopPropagation: () => {},
                    preventDefault: () => {},
                  });
                }
              }}
            >
              <i className="fas fa-trash-alt w-4 text-center"></i>
              <span>{label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
