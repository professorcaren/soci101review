/**
 * Google Apps Script web app for SOCI 101 Exam Review progress sync.
 *
 * Deploy as web app:
 *   1. Open script.google.com, create a new project
 *   2. Paste this code into Code.gs
 *   3. Create a Google Sheet and open it (the script binds to the active spreadsheet)
 *      — or use Extensions > Apps Script from within a Sheet
 *   4. Deploy > New deployment > Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 *   5. Copy the deployment URL
 *   6. Set APPS_SCRIPT_URL in js/sync.js to that URL
 *
 * Sheet "Progress" columns:
 *   ONYEN | Name | Last Sync | Ch01% | Ch02% | ... | Ch16% | Overall% | Full JSON
 *
 * Sheet "Student Concepts" columns (one row per student per concept attempted):
 *   ONYEN | Name | Chapter | Term | Learned? | Current Level | L1 | L2 | L3
 *
 * Sheet "Analytics" columns (auto-generated from student data):
 *   Concept ID | Term | Chapter | Total Students Attempted | Avg Error Rate | Most Common Wrong Level
 */

const SHEET_NAME = 'Progress';
const NUM_CHAPTERS = 16;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet();
    upsertStudent(sheet, data);
    if (data.concepts && data.concepts.length > 0) {
      updateStudentConcepts(data);
    }
    if (data.analytics && data.analytics.length > 0) {
      updateAnalytics(data.analytics);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'analytics') {
      return getAnalyticsData();
    }

    // Look up student by ONYEN
    const onyen = e.parameter.onyen;
    if (!onyen) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'onyen required' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const sheet = getOrCreateSheet();
    const row = findStudentRow(sheet, onyen);
    if (!row) {
      return ContentService.createTextOutput(JSON.stringify(null))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const jsonCol = headers.indexOf('Full JSON') + 1;
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
    const headers = ['ONYEN', 'Name', 'Last Sync'];
    for (let i = 1; i <= NUM_CHAPTERS; i++) {
      headers.push('Ch' + String(i).padStart(2, '0') + ' %');
    }
    headers.push('Overall %', 'Full JSON');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function findStudentRow(sheet, onyen) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const onyens = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < onyens.length; i++) {
    if (String(onyens[i][0]).trim() === String(onyen).trim()) return i + 2;
  }
  return null;
}

function upsertStudent(sheet, data) {
  const onyen = data.onyen;
  if (!onyen) return;

  let row = findStudentRow(sheet, onyen);
  if (!row) row = sheet.getLastRow() + 1;

  const values = [onyen, data.studentName || '', new Date().toISOString()];
  for (let i = 1; i <= NUM_CHAPTERS; i++) {
    const chId = 'ch' + String(i).padStart(2, '0');
    values.push(data.chapterProgress[chId] || 0);
  }
  // Overall = average of chapter percentages
  let totalPct = 0;
  for (let i = 1; i <= NUM_CHAPTERS; i++) {
    const chId = 'ch' + String(i).padStart(2, '0');
    totalPct += (data.chapterProgress[chId] || 0);
  }
  values.push(Math.round(totalPct / NUM_CHAPTERS));
  values.push(JSON.stringify(data.fullData));

  sheet.getRange(row, 1, 1, values.length).setValues([values]);
}

// --- Student Concepts ---

var CONCEPTS_SHEET_NAME = 'Student Concepts';

function getOrCreateConceptsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONCEPTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONCEPTS_SHEET_NAME);
    var headers = ['ONYEN', 'Name', 'Chapter', 'Term', 'Learned?', 'Current Level', 'L1', 'L2', 'L3'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function updateStudentConcepts(data) {
  var onyen = data.onyen;
  if (!onyen || !data.concepts) return;
  var sheet = getOrCreateConceptsSheet();

  // Delete existing rows for this student
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var onyens = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    // Collect row indices to delete (bottom-up to avoid shifting)
    var rowsToDelete = [];
    for (var i = 0; i < onyens.length; i++) {
      if (String(onyens[i][0]).trim() === String(onyen).trim()) {
        rowsToDelete.push(i + 2);
      }
    }
    for (var j = rowsToDelete.length - 1; j >= 0; j--) {
      sheet.deleteRow(rowsToDelete[j]);
    }
  }

  // Write new rows
  var levelNames = { 0: 'Learned', 1: 'L1: Term → Def', 2: 'L2: Def → Term', 3: 'L3: Application' };
  var rows = [];
  for (var k = 0; k < data.concepts.length; k++) {
    var c = data.concepts[k];
    rows.push([
      onyen,
      data.studentName || '',
      c.chapter,
      c.term,
      c.learned ? 'Yes' : 'No',
      levelNames[c.currentLevel] || 'L' + c.currentLevel,
      c.l1,
      c.l2,
      c.l3,
    ]);
  }
  if (rows.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, 9).setValues(rows);
  }
}

// --- Analytics ---

var ANALYTICS_SHEET_NAME = 'Analytics';

function getOrCreateAnalyticsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ANALYTICS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ANALYTICS_SHEET_NAME);
    var headers = ['Concept ID', 'Term', 'Chapter', 'Total Students Attempted', 'Avg Error Rate', 'Most Common Wrong Level'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function updateAnalytics(analytics) {
  var progressSheet = getOrCreateSheet();
  var analyticsSheet = getOrCreateAnalyticsSheet();
  var conceptMap = {};
  var lastRow = progressSheet.getLastRow();
  if (lastRow < 2) return;
  var headers = progressSheet.getRange(1, 1, 1, progressSheet.getLastColumn()).getValues()[0];
  var jsonCol = headers.indexOf('Full JSON') + 1;
  if (jsonCol === 0) return;
  var jsonData = progressSheet.getRange(2, jsonCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < jsonData.length; i++) {
    try {
      var fullData = JSON.parse(jsonData[i][0]);
      if (!fullData || !fullData.concepts) continue;
      for (var conceptId in fullData.concepts) {
        var cp = fullData.concepts[conceptId];
        var attempts = (cp.level1 ? cp.level1.attempts : 0) + (cp.level2 ? cp.level2.attempts : 0) + (cp.level3 ? cp.level3.attempts : 0);
        if (attempts === 0) continue;
        var correct = (cp.level1 ? cp.level1.correct : 0) + (cp.level2 ? cp.level2.correct : 0) + (cp.level3 ? cp.level3.correct : 0);
        var errorRate = Math.round(((attempts - correct) / attempts) * 100);
        if (!conceptMap[conceptId]) conceptMap[conceptId] = { term: '', chapter: '', errorRates: [], levels: [] };
        conceptMap[conceptId].errorRates.push(errorRate);
        var l1err = cp.level1 ? cp.level1.attempts - cp.level1.correct : 0;
        var l2err = cp.level2 ? cp.level2.attempts - cp.level2.correct : 0;
        var l3err = cp.level3 ? cp.level3.attempts - cp.level3.correct : 0;
        var maxErr = Math.max(l1err, l2err, l3err);
        if (maxErr > 0) {
          if (l1err === maxErr) conceptMap[conceptId].levels.push(1);
          else if (l2err === maxErr) conceptMap[conceptId].levels.push(2);
          else conceptMap[conceptId].levels.push(3);
        }
      }
    } catch (e) {}
  }
  for (var j = 0; j < analytics.length; j++) {
    var item = analytics[j];
    if (conceptMap[item.conceptId]) {
      conceptMap[item.conceptId].term = item.term;
      conceptMap[item.conceptId].chapter = item.chapter;
    }
  }
  var rows = [];
  for (var cid in conceptMap) {
    var data = conceptMap[cid];
    var totalStudents = data.errorRates.length;
    var avgError = Math.round(data.errorRates.reduce(function(a, b) { return a + b; }, 0) / totalStudents);
    var levelCounts = {};
    for (var k = 0; k < data.levels.length; k++) {
      levelCounts[data.levels[k]] = (levelCounts[data.levels[k]] || 0) + 1;
    }
    var modeLevel = '', maxCount = 0;
    for (var lvl in levelCounts) {
      if (levelCounts[lvl] > maxCount) { maxCount = levelCounts[lvl]; modeLevel = lvl; }
    }
    rows.push([cid, data.term || cid, data.chapter || '', totalStudents, avgError, modeLevel ? 'L' + modeLevel : '']);
  }
  if (rows.length === 0) return;
  var lastAnalyticsRow = analyticsSheet.getLastRow();
  if (lastAnalyticsRow > 1) analyticsSheet.getRange(2, 1, lastAnalyticsRow - 1, 6).clearContent();
  rows.sort(function(a, b) { return b[4] - a[4]; });
  analyticsSheet.getRange(2, 1, rows.length, 6).setValues(rows);
}

function getAnalyticsData() {
  var sheet = getOrCreateAnalyticsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var result = data.map(function(row) {
    return { conceptId: row[0], term: row[1], chapter: row[2], studentsAttempted: row[3], avgErrorRate: row[4], mostCommonWrongLevel: row[5] };
  });
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
