export const getStatusColor = (status = "") => {
  const key = (status || "").toString().toLowerCase();

  if (key.includes("act") || key.includes("open") || key.includes("ouvert") || key.includes("en cours")) {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  }

  if (key.includes("attente") || key.includes("hold") || key.includes("pending")) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }

  if (key.includes("ferm") || key.includes("clos") || key.includes("termin")) {
    return "bg-slate-200 text-slate-800 dark:bg-slate-800/50 dark:text-slate-200";
  }

  return "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-200";
};
