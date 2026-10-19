export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportCsv(rows, deidentified = false) {
  const columns = ["id", "age", "language", "questionnaire_version", "started_at", "completed_at", "status"];
  if (!deidentified) columns.splice(1, 0, "first_name", "last_name", "email");
  const fields = ["choices", "text", "followup", "attraction", "concern"];
  for (let number = 1; number <= 12; number += 1) {
    for (const field of fields) columns.push(`q${String(number).padStart(2, "0")}_${field}`);
  }
  const values = rows.map((row) => columns.map((column) => {
    if (column === "status") return row.completed_at ? "completed" : "in_progress";
    const match = /^(q\d{2})_(.+)$/.exec(column);
    const value = match ? row.answers?.[match[1]]?.[match[2]] : row[column];
    return Array.isArray(value) ? value.join("|") : value;
  }));
  return `\uFEFF${[columns, ...values].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
