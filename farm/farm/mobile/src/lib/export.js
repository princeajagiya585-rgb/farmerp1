/**
 * Client-side data export helpers for the mobile app.
 * Generates CSV files (openable in Excel/Google Sheets) and shares them
 * using the device's native share sheet.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Extract plain text from a value (handles strings, numbers, objects).
 */
function toText(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Export an array of objects to a CSV file and share it.
 *
 * @param {Array} rows - Array of data objects.
 * @param {Array} columns - [{key, header}]  column definition.
 * @param {string} filename - e.g. "location-history.csv"
 */
export async function exportCSV(rows, columns, filename = 'export.csv') {
  // Filter out action columns
  const cols = columns.filter((c) => c.key !== '_actions');

  // Build header row
  const header = cols.map((c) => `"${String(c.header || '').replace(/"/g, '""')}"`).join(',');

  // Build data rows
  const dataRows = rows.map((r) =>
    cols
      .map((c) => {
        const v = c.render ? c.render(r) : r[c.key];
        const text = toText(v);
        return `"${text.replace(/"/g, '""')}"`;
      })
      .join(','),
  );

  const csv = `${header}\n${dataRows.join('\n')}`;

  // Write to a temp file
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  // Share the file
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: `Export ${filename}`,
    });
  } else {
    // Fallback: alert with a message
    alert('Sharing is not available on this device.');
  }
}

/**
 * Simple helper to build column definitions from object keys.
 */
export function autoColumns(keys, labels = {}) {
  return keys.map((key) => ({
    key,
    header: labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
}
