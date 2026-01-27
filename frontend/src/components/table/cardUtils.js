import { Children, isValidElement } from "react";
import { IconButton } from "./TableActions";

export const inferCardRole = (columnId = "") => {
  const id = String(columnId).toLowerCase();
  if (!id) return "detail";
  if (id === "actions" || id.includes("action")) return "actions";
  if (["name", "title", "label", "reference", "number", "lawsuitnumber", "missionnumber"].includes(id)) {
    return "primary";
  }
  if (id.includes("status") || id.includes("state")) return "status";
  if (id.includes("priority")) return "status";
  if (
    id.includes("date") ||
    id.includes("time") ||
    id.includes("due") ||
    id.includes("next") ||
    id.includes("created") ||
    id.includes("updated")
  ) {
    return "meta";
  }
  return "detail";
};

export const collectIconActions = (node, actions = []) => {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === IconButton) {
      actions.push(child.props);
      return;
    }
    if (child.props?.children) {
      collectIconActions(child.props.children, actions);
    }
  });
  return actions;
};

export const buildCardCellsFromChildren = (children) => {
  const cells = Children.toArray(children).filter(isValidElement);
  return cells.map((cell, index) => {
    const {
      columnId,
      mobileLabel,
      mobileRole,
      mobileHidden,
      mobilePriority,
    } = cell.props || {};
    const resolvedColumnId = columnId || `column-${index}`;
    const role = mobileRole || inferCardRole(resolvedColumnId);
    const hidden = Boolean(mobileHidden) || role === "actions";

    return {
      key: cell.key ?? resolvedColumnId,
      columnId: resolvedColumnId,
      label: mobileLabel || resolvedColumnId,
      role,
      hidden,
      priority:
        typeof mobilePriority === "number" ? mobilePriority : Number.POSITIVE_INFINITY,
      content: cell.props?.children,
    };
  });
};

export const buildCardCellsFromColumns = (columns = [], item) => {
  return columns.map((column, index) => {
    const columnId = column.id || `column-${index}`;
    const role = column.mobileRole || inferCardRole(columnId);
    const hidden = Boolean(column.mobileHidden) || role === "actions";
    const label = column.mobileLabel || column.label || columnId;
    const priority =
      typeof column.mobilePriority === "number" ? column.mobilePriority : Number.POSITIVE_INFINITY;
    const content = column.render ? column.render(item) : item?.[columnId];

    return {
      key: columnId,
      columnId,
      label,
      role,
      hidden,
      priority,
      content,
    };
  });
};
