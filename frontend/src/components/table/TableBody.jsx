/**
 * TableBody.jsx
 * Wrapper for table rows
 * Handles empty state automatically if no children
 */

import TableEmpty from "./TableEmpty";

export default function TableBody({ children, isEmpty = false, emptyMessage = null }) {
  if (isEmpty || !children) {
    return (
      <tbody>
        <tr>
          <td colSpan="100%" className="p-0">
            <TableEmpty message={emptyMessage} />
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-700">
      {children}
    </tbody>
  );
}