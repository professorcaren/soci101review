/**
 * Google Apps Script web app for SOCI 101 Exam Review progress sync.
 *
 * Deploy as web app:
 *   1. Open script.google.com, paste this code
 *   2. Deploy > New deployment > Web app
 *   3. Execute as: Me, Access: Anyone
 *   4. Copy the URL and set it in js/sync.js
 *
 * Sheet format: Row 1 = headers, subsequent rows = one per student
 * Columns: Name | Last Sync | Ch01 % | Ch02 % | ... | Ch16 % | Full JSON
 */

const SHEET_NAME = 'Progress';
const NUM_CHAPTERS = 16;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet();
    upsertStudent(sheet, data);
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const name = e.parameter.name;
    if (!name) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'name required' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const sheet = getOrCreateSheet();
    const row = findStudentRow(sheet, name);
    if (!row) {
      return ContentService.createTextOutput(JSON.stringify(null))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const jsonCol = 3 + NUM_CHAPTERS; // After Name, LastSync, and chapter columns
    const jsonStr = sheet.getRange(row, jsonCol).getValue();
    const fullData = jsonStr ? JSON.parse(jsonStr) : null;
    return ContentService.createTextOutput(JSON.stringify(fullData))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = ['Name', 'Last Sync'];
    for (let i = 1; i <= NUM_CHAPTERS; i++) {
      headers.push('Ch' + String(i).padStart(2, '0') + ' %');
    }
    headers.push('Full JSON');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function findStudentRow(sheet, name) {
  const names = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 1).getValues();
  for (let i = 0; i < names.length; i++) {
    if (names[i][0] === name) return i + 2; // +2 for 1-indexed + header row
  }
  return null;
}

function upsertStudent(sheet, data) {
  const name = data.studentName;
  if (!name) return;

  let row = findStudentRow(sheet, name);
  if (!row) {
    row = sheet.getLastRow() + 1;
  }

  const values = [name, new Date().toISOString()];
  for (let i = 1; i <= NUM_CHAPTERS; i++) {
    const chId = 'ch' + String(i).padStart(2, '0');
    values.push(data.chapterProgress[chId] || 0);
  }
  values.push(JSON.stringify(data.fullData));

  sheet.getRange(row, 1, 1, values.length).setValues([values]);
}
