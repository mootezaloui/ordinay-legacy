/**
 * TableBody.jsx
 * Wrapper for table rows
 * Handles empty state automatically if no children
 *
 * Styling architecture:
 * - Empty state uses colSpan={999} to span all columns (valid number, unlike "100%")
 * - Consistent tbody styling whether empty or populated
 * - No visual differences in table structure between states
 */

import TableEmpty from "./TableEmpty";

export default function TableBody({ children, isEmpty = false, emptyMessage = null }) {
  if (isEmpty || !children) {
    return (
      <tbody className="bg-transparent">
        <tr className="hover:bg-transparent">
          {/* colSpan must be a number; 999 ensures it spans all columns regardless of count */}
          <td
            colSpan={999}
            className="p-0 border-0 !align-top"
            style={{ verticalAlign: "top" }}
          >
            <TableEmpty message={emptyMessage} compact />
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody className="bg-transparent md:divide-y divide-slate-200 dark:divide-slate-700">
      {children}
    </tbody>
  );
}
