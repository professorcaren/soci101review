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
 * Columns: Name | Last Sync | Ch01 % | Ch02 % | ... | Ch16 % | XP | Streak | Mastery % | Full JSON
 */

const SHEET_NAME = 'Progress';
const NUM_CHAPTERS = 16;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet();
    upsertStudent(sheet, data);
    if (data.analytics && data.analytics.length > 0) {
      updateAnalytics(data.studentName, data.analytics);
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
    if (action === 'leaderboard') {
      return getLeaderboard();
    }
    if (action === 'analytics') {
      return getAnalyticsData();
    }

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
    const headers = ['Name', 'Last Sync'];
    for (let i = 1; i <= NUM_CHAPTERS; i++) {
      headers.push('Ch' + String(i).padStart(2, '0') + ' %');
    }
    headers.push('XP', 'Streak', 'Mastery %', 'Full JSON');
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
  if (!row) row = sheet.getLastRow() + 1;

  const values = [name, new Date().toISOString()];
  for (let i = 1; i <= NUM_CHAPTERS; i++) {
    const chId = 'ch' + String(i).padStart(2, '0');
    values.push(data.chapterProgress[chId] || 0);
  }
  values.push(data.xp || 0);
  values.push(data.streak || 0);
  // Overall mastery = average of chapter percentages
  let totalPct = 0;
  for (let i = 1; i <= NUM_CHAPTERS; i++) {
    const chId = 'ch' + String(i).padStart(2, '0');
    totalPct += (data.chapterProgress[chId] || 0);
  }
  values.push(Math.round(totalPct / NUM_CHAPTERS));
  values.push(JSON.stringify(data.fullData));

  sheet.getRange(row, 1, 1, values.length).setValues([values]);
}

function getLeaderboard() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const nameCol = 0;
  const xpCol = headers.indexOf('XP');
  const streakCol = headers.indexOf('Streak');
  const masteryCol = headers.indexOf('Mastery %');

  const leaderboard = data
    .filter(row => row[nameCol])
    .map(row => ({
      name: formatName(String(row[nameCol])),
      xp: xpCol >= 0 ? (row[xpCol] || 0) : 0,
      streak: streakCol >= 0 ? (row[streakCol] || 0) : 0,
      mastery: masteryCol >= 0 ? (row[masteryCol] || 0) : 0,
    }))
    .sort((a, b) => b.xp - a.xp);

  return ContentService.createTextOutput(JSON.stringify(leaderboard))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return parts[0] + ' ' + parts[parts.length - 1][0] + '.';
  }
  return parts[0];
}

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

function updateAnalytics(studentName, analytics) {
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
