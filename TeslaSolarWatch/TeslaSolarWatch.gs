/**
 * Tesla Solar Watch version 1.1.
 * 
 * This code is subject to the software license at https://github.com/TorZidan/TeslaWatch/blob/main/LICENSE
 * 
 * This is the Apps Script code for the Tesla Solar Watch project.
 * See https://github.com/TorZidan/TeslaWatch/blob/main/TeslaSolarWatch/README.md for more info.
 * 
 * The Tesla Restful API is described at
 * https://t-tesla.thaddeusmaximusgames.com/owner-solar-system-api/
 * and
 * https://tesla-api.timdorr.com/energy-products/energy
 * , however that information may be outdated.
 */

// All these fields will be automatically added as a "header row" on row 1 of the spreadsheet:
const SCRIPT_RUN_TIMESTAMP_FIELD_NAME = "apps_script_run_timestamp";
// These fields are part of the Tesla data API:
const ENERGY_SITE_FIELD_NAMES = [
  "timestamp",
  "solar_energy_exported",
  "grid_energy_imported",
  "grid_energy_exported_from_solar",
  "grid_energy_exported_from_battery",
  "battery_energy_exported",
  "battery_energy_imported_from_grid",
  "battery_energy_imported_from_solar",
  "consumer_energy_imported_from_grid",
  "consumer_energy_imported_from_solar",
  "consumer_energy_imported_from_battery"
];

/**
 * The main function in this app.
 * 
 * It should be scheduled to run daily, e.g. around 1AM, in the "Triggers" section
 * of your AppsScript project.
 * 
 * Uses a spreadsheet to store the data retrieved at each call, for convenience and history preservation.
 * 
 * Makes the necessary calls to the Tesla API server over https to retrieve data.
 * For each solar installation in this tesla account:
 *   - retrieves solar usage data for the previous day.
 *   - sends email if the generated solar power was below the predefined threshold.
 *   - inserts a row in the spreadsheet tab that coresponds to this solar installation.
 */
function main() {
  // Make sure all settings have been properly set:
  if(TESLA_SOLAR_WATCH_SPREADSHEET_URL==null || TESLA_SOLAR_WATCH_SPREADSHEET_URL==="") {
    throw ("The variable TESLA_SOLAR_WATCH_SPREADSHEET_URL is empty. Please enter your spreadsheet url in it. Most often the varaiable is in file Settings.gs");
  }
  if(EMAIL_RECIPIENTS==null || EMAIL_RECIPIENTS==="") {
    throw ("The variable EMAIL_RECIPIENTS is empty. Please enter the email recepient(s) it. Most often the varaiable is in file Settings.gs");
  }
  if(REFRESH_TOKEN==null || REFRESH_TOKEN==="") {
    throw ("The variable REFRESH_TOKEN is empty. Please follow the instructions at ... to get a new refresh token and then copy/paste it in this variable. Most often the varaiable is in file Settings.gs");
  }
  
  // The spreadsheet object
  var sheet = SpreadsheetApp.openByUrl(TESLA_SOLAR_WATCH_SPREADSHEET_URL);

  // We need an access token (a long giberrish string) to communicate with the Tesla API server.
  // The access token usually expires in 8 hours; 
  // Since we are running this code every 24 hours, we need to refresh it first:
  var accessToken = getNewAccessToken(REFRESH_TOKEN, EMAIL_RECIPIENTS);

  // Retrieve the energy products in my Tesla account (aka energy site id-s):
  const arrayOfEnergySiteIds = listEnergySiteIdsForAccount(accessToken);

  // For each energy product (aka energy site id), retrieve the energy stats for the last 1 day,
  // find the corresponsding spreadsheet tab for this product, and append a row in that tab:
  for(i=0; i < arrayOfEnergySiteIds.length; i++) {
    const energySiteId = arrayOfEnergySiteIds[i];
    
    // e.g. "America/Los_Angeles":
    const energySiteTimeZoneAndCountryCode = getEnergySiteTimeZoneAndCountryCode(energySiteId, accessToken);

    // Example: 2023-12-22T11:13:06-0800
    const currentTimestampInUtcFormatted = Utilities.formatDate(new Date(), energySiteTimeZoneAndCountryCode.timeZone, 'yyyy-MM-dd\'T\'HH:mm:ssZ');
    
    // Get data for last day (for yesterday):
    const periodToRequestDataFor = "day";
    // Note that we pass numDaysBeforeToday=1 so that we'll get data for yesterday (not for today):
    const numDaysBeforeToday=1;
    // An array (containing 1 row) of "daily stats data structure" that contains many attributes, e.g. "solar_energy_exported":
    const data = getEnergyDataForLastDayOrWeekOrMonth(energySiteId, periodToRequestDataFor, energySiteTimeZoneAndCountryCode.timeZone, numDaysBeforeToday, accessToken);

    // Find the (first) tab in the spreadsheet that contains the string "<energy_site_id> - Daily Script Run", 
    // e.g. "2252181956594930 - Daily Script Run". 
    // This way the user may choose to rename the tab to e.g. "My Solar System - 2252181956594930 - Daily Script Run", 
    // and the code will still locate it:
    const sheetTabForProductId = findOrCreateSheetTabWithNameLike(sheet, energySiteId+" - Daily Script Run");
    
    // Insert a header row with column names, if not already present:
    insertHeaderRowWithColumnNamesIfNeeded(sheetTabForProductId);

    // for(zz=0; zz<data.length; zz++) {
    //   Logger.log(zz+" : "+data[zz].timestamp+"  : " + data[zz].solar_energy_exported);
    // }

    //There should be just 1 row in the "data" array (for yesterday):
    if(data.length!=1) {
      throw ("Things did not go well. Expected 1 row of data (for last day), but got "+data.length+" rows!");
    }
    const dataForLastDay = data[0];

    var newRowDataAsArray = [];
    // The 1st column contains the (start) time of this run:
    newRowDataAsArray.push(currentTimestampInUtcFormatted);
    // The rest of the columns in the row are populated from the Tesla data:
    for(j=0; j < ENERGY_SITE_FIELD_NAMES.length; j++) {
      const fieldName = ENERGY_SITE_FIELD_NAMES[j];
      newRowDataAsArray.push(dataForLastDay[fieldName]);
    }
    // Append the row at the end:
    sheetTabForProductId.appendRow(newRowDataAsArray);

    const spreadsheetUrlForEmail = composeSpreadsheetTabUrl(TESLA_SOLAR_WATCH_SPREADSHEET_URL, sheetTabForProductId.getSheetId(), sheetTabForProductId.getLastRow());

    const enegryGeneratedDuringLastDayWatts = dataForLastDay[ENERGY_SITE_FIELD_NAMES[1]];
    if(enegryGeneratedDuringLastDayWatts <= DAILY_SOLAR_GENERATION_ALERT_THRESHOLD_WATTS) {
      Logger.log("Alert: in the last day energySiteId "+energySiteId+" generated "+enegryGeneratedDuringLastDayWatts+" watts, which is below the alerting threshold of "+DAILY_SOLAR_GENERATION_ALERT_THRESHOLD_WATTS+" watts. Sending an alert email to "+EMAIL_RECIPIENTS);
      sendAlertEmail(
        (arrayOfEnergySiteIds.length>1)? energySiteId:"",
        enegryGeneratedDuringLastDayWatts, 
        DAILY_SOLAR_GENERATION_ALERT_THRESHOLD_WATTS, EMAIL_RECIPIENTS, 
        spreadsheetUrlForEmail);
    } else {
      Logger.log("All is good: in the last day energySiteId "+energySiteId+" generated "+enegryGeneratedDuringLastDayWatts+" watts, which is above the alerting threshold of "+DAILY_SOLAR_GENERATION_ALERT_THRESHOLD_WATTS+" watts.");
    }

    sendSummaryEmailIfNeeded(
        energySiteId,
        energySiteTimeZoneAndCountryCode.timeZone,
        energySiteTimeZoneAndCountryCode.countryCode,
        SUMMARY_EMAIL_TYPE, 
        EMAIL_RECIPIENTS, 
        sheet);
  }
}

/**
 * As it says
 */
function insertHeaderRowWithColumnNamesIfNeeded(sheetTab) {
  const cellA0Value = sheetTab.getRange(1, 1, 1, 1).getValue();
  if(cellA0Value != SCRIPT_RUN_TIMESTAMP_FIELD_NAME) {
    // Insert 1 new row(s) at position 1:
    sheetTab.insertRows(1, 1);
    // getRange(row, column, numRows, numColumns):
    sheetTab.getRange(1,1,1,1).setValue(SCRIPT_RUN_TIMESTAMP_FIELD_NAME);
    sheetTab.getRange(1,2,1,ENERGY_SITE_FIELD_NAMES.length).setValues([ENERGY_SITE_FIELD_NAMES]);
    // Freeze the header row, so that when we scroll down the hundreds of data rows, we always see it:
    sheetTab.setFrozenRows(1);
  }
}

/**
 * Finds the (first) tab in this spreadsheet whose name contains the string in tabNameSubstring, and returns it.
 * If not found, then creates a new tab with name tabNameSubstring and returns it.
 */
function findOrCreateSheetTabWithNameLike(spreadsheet, tabNameSubstring) {
  var sheetTabsArray = spreadsheet.getSheets();
  for(i=0; i < sheetTabsArray.length; i++) {
    if(sheetTabsArray[i].getName().includes(tabNameSubstring)) {
      return sheetTabsArray[i];
    }
  }
  var newSheetTab = spreadsheet.insertSheet();
  newSheetTab.setName(tabNameSubstring);
  return newSheetTab;
}

/**
 * Calls the Tesla API at "https://owner-api.teslamotors.com/api/1/products",
 * retrieves all products owned by this account (vehicles, mars rockets, solar/energy installations, flame throwers),
 * then filters only the solar/energy installations, and returns an array of their "siteId-s".
 * 
 * Sample response text:
    {
      "response": [
        {
          "id": 1492931576552070,
          "vehicle_id": 1557873031,
        },
        {
          "energy_site_id": 2252181956594930,
          "resource_type": "solar",
          "id": "STE20221227-00187",
          "asset_site_id": "a6e5970f-e4f0-4e7e-872c-cd1509cfb616",
          "grid_installation_id": "1147969e-5038-44d8-a06e-48c5aa18a7b3",
        }
      ],
      "count": 2
    }
 */
function listEnergySiteIdsForAccount(accessToken) {
  try {
    const url = "https://owner-api.teslamotors.com/api/1/products";
    
    var options = {
      'headers': {
        'authorization': 'Bearer ' + accessToken
      }
    };

    const responseText = UrlFetchApp.fetch(url, options);
    const allData = JSON.parse(responseText);
    //Logger.log(allData);

    if(allData["response"] == null || allData["response"].length ==0) {
      throw ("Things did not go well. There is no 'response' entry in the response text, or it contains no 'products': "+responseText);
    }
    const innerData = allData["response"];
    Logger.log(innerData);

    var energySiteIds = [];
    for(i=0; i< innerData.length; i++) {
      const product = innerData[i];

      if(product["energy_site_id"] != null) {
        energySiteIds.push(product["energy_site_id"]);
      }
    }

    Logger.log("Found the followingfenergy siteId-s in my Tesla account: "+energySiteIds);
    return energySiteIds;
  } catch (e) {
    Logger.log("The Tesla API call "+url+" failed. See the error below for more info.");
    throw e;
  }
}

/**
 * Calls the Tesla API at "https://owner-api.teslamotors.com/api/1/energy_sites/{siteId}/site_info"
 * and retrieves the time zone (e.g. 'America/Los_Angeles')  and country code (e.g. "US") of this energy siteId.
 */
function getEnergySiteTimeZoneAndCountryCode(siteId, accessToken) {
  try {
    const url = "https://owner-api.teslamotors.com/api/1/energy_sites/"+siteId+"/site_info";
    Logger.log("Getting site info from "+url);

    var options = {
      'headers': {
        'authorization': 'Bearer ' + accessToken
      }
    };

    const responseText = UrlFetchApp.fetch(url, options);
    const allData = JSON.parse(responseText);
    //Logger.log(allData);

    const responseData = allData["response"];
    if(responseData == null) {
      throw ("Unexpected response from url '"+url+"' : there is no 'response' entry in the response text: "+responseText);
    }

    const timeZone = responseData["installation_time_zone"];
    // Another way of doing this: const timeZone = allData.response.installation_time_zone;
    //Logger.log(result);
    if(timeZone == null || timeZone==="") {
      throw ("Unexpected response from url '"+url+"' : there is no 'installation_time_zone' entry in the response text: "+responseText);
    }

    const countryCode = (responseData["address"])? responseData["address"]["country"] : null;

    Logger.log("Got response.installation_time_zone='" + timeZone + "', response.address.country='"+countryCode+"'");
    return {timeZone:timeZone, countryCode:countryCode};
  } catch (e) {
    Logger.log("The Tesla API call "+url+" failed. See the error below for more info.");
    throw e;
  }
}


/**
 * Calls the Tesla API at "https://owner-api.teslamotors.com/api/1/energy_sites/{siteId}/calendar_history?......"
 * and retrieves the energy stats (one row per day) in the last one month (from the 1st of the month)
 * or last one week (from Monday until now).
 * Returns an array of "daily stats" data structures.
 * 
 * The "period" should be one of: "day", "week", "month", "year" (or "lifetime", we don't use it).
 * 
 * The numDaysBeforeToday is a number, typically set to 0 (to retrieve data until yesterday inclusive). It is used to determine the end_data parameter in the Tesla API call.
 * 
 * Note: The "&time_zone=..."url parameter DOES matter, even though it is not documented anywhere:
 * If I omit it, I get different data (because the start/end time of the day is different if I choose another time zone.
 * 
 * Note: For period=month it actually returns data from the previous month's last day up until yesterday;
 * this way, even if we make the call on the 1st of the month, we will find in it yeasterday's data.
 */
function getEnergyDataForLastDayOrWeekOrMonth(siteId, period, inTimeZone, numDaysBeforeToday, accessToken) {
  var  timestamp = new Date();
  if(numDaysBeforeToday>0) {
     // Subtract numDaysBeforeToday from the current timestamp:
     timestamp2 = new Date( timestamp.setDate( timestamp.getDate()-numDaysBeforeToday));
     timestamp = timestamp2;
  }
  // Cpompose an "end of the given day" timestamp, e.g. "2024-08-10T23:59:59-07:00". The tesla API does NOT like (errors out) at "midnight" timestamps, e.g.at "2024-08-10T00:00:00-07:00" and "2024-08-10T24:00:00-07:00".
  const timestampInTimeZoneFormatted = Utilities.formatDate( timestamp, inTimeZone, 'yyyy-MM-dd\'T23:59:59\'XXX');
  const url = "https://owner-api.teslamotors.com/api/1/energy_sites/"+siteId+"/calendar_history?kind=energy&period="+period+"&time_zone="+inTimeZone+"&end_date="+timestampInTimeZoneFormatted;
  Logger.log("Getting energy stats for last "+period+" from "+url);
  try {
    var options = {
      'headers': {
        'authorization': 'Bearer ' + accessToken
      }
    };

    const responseText = UrlFetchApp.fetch(url, options);
    const allData = JSON.parse(responseText);
    Logger.log(allData);

    if(allData["response"] == null) {
      throw ("Things did not go well. There is no 'response' entry in the response text: "+responseText);
    }
    const innerData = allData["response"];
    //Logger.log(innerData);

    if(innerData["time_series"] == null || innerData["time_series"].length ==0) {
      throw ("Things did not go well. There is no 'time_series' entry in the response text: "+responseText);
    }
    const data = innerData["time_series"];
    Logger.log("Got " + data.length + " rows of data for last "+period+".");
    //Logger.log(data);

    const groupedByDayData = groupByDay(data);
    Logger.log("Merged them into " +groupedByDayData.length + " rows (one per day).");
    //Logger.log(groupedByDayData);
    return groupedByDayData;
  } catch (e) {
    Logger.log("The Tesla API call "+url+" failed. See the error below for more info.");
    throw e;
  }
}

/**
 * The call to /calendar_history?kind=energy&period=...
 * returns an array with one record per 30-minute interval.
 * This function merges and aggregates multiple such record,
 * and returns one record per day. It can merge input data
 * that is stored at any interval (that is shorter-or-equal than one day).
 * 
 * It (unnecessarily, for simpler code) modified the passed data structure, 
 * so do not use it after the call.
 * 
 */
function groupByDay(data) {
  result=[];
  lastTruncatedDateSeen = "";
  // The row where we saw for a first time the last truncated date above:
  rowAtTruncatedDate = null;
  for(i=0; i<data.length; i++) {
    currentRow = data[i];
    truncatedDate = currentRow.timestamp.substring(0, 10);
    if(lastTruncatedDateSeen!=truncatedDate || i==(data.length-1)) {
      if(lastTruncatedDateSeen!="") {
        //Logger.log("Collecting row for date "+lastTruncatedDateSeen);
        result.push(rowAtTruncatedDate);
      }
      lastTruncatedDateSeen = truncatedDate;
      rowAtTruncatedDate = currentRow;
    } else {
      // Skip aggregating field "timstamp", which is at offset 0 in ENERGY_SITE_FIELD_NAMES:
      for(j=1; j < ENERGY_SITE_FIELD_NAMES.length; j++) {
        const fieldName = ENERGY_SITE_FIELD_NAMES[j];
        rowAtTruncatedDate[fieldName] += currentRow[fieldName];
      }
      // rowAtTruncatedDate.solar_energy_exported += currentRow.solar_energy_exported;
      // rowAtTruncatedDate["solar_energy_exported"] += currentRow["solar_energy_exported"];
    }
    //Logger.log(i + " : " + truncatedDate + " : " + currentRow.timestamp + " : " + currentRow.solar_energy_exported);
  }
  return result;
}

/**
 * Calls the Tesla API at "https://auth.tesla.com/oauth2/v3/token".
 * Passes the "refresh_token" and gets a new "access_token",
 * which will be used in all the rest of the API calls here.
 * The refresh_token is still good for future use; the access_token is valid for only a few hours. 
 */
function getNewAccessToken(refreshToken, emailRecipientsIfFailed) {
  /*
  # Analogy using linux command line:
  export refresh_token=...
  curl -i -X POST https://auth.tesla.com/oauth2/v3/token \
    -H "Content-Type: application/json" \
    -d "{\"grant_type\":\"refresh_token\",\"client_id\":\"ownerapi\",\"refresh_token\":\"$refresh_token\",\"scope\":\"openid email offline_access\"}"
  */
  try {
    const url = "https://auth.tesla.com/oauth2/v3/token";
    const request = {
      "grant_type": "refresh_token",
      "client_id": "ownerapi",
      "refresh_token": refreshToken,
      "scope": "openid email offline_access"
    };
    const options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(request)
    };
    const response = UrlFetchApp.fetch(url, options);
    // Logger.log("The getNewAccessToken http response was: "+response);
    // Sample response:  {refresh_token=aaaaa, expires_in=28800.0, access_token=bbbbb, id_token=ccccc, token_type=Bearer} 
    // Note: the access_token being returned is the same as the one being sent in the request.
    var data = JSON.parse(response);
    var accessToken = data["access_token"];
    Logger.log("Got new access token: "+accessToken);
    return accessToken;
  } catch (e) {
    Logger.log("The Tesla Solar Watch Apps Script could not access your data at Tesla.com. Most likely your refresh token has expired and needs to be renewed. Check your email for instructions how to fix it.");
    MailApp.sendEmail({
      to: emailRecipientsIfFailed,
      subject: "The Tesla Solar Watch Apps Script could not access your data at Tesla.com. Most likely your refresh token has expired and needs to be renewed. Read on.",
      htmlBody: "The Tesla Solar Watch <a href='https://script.google.com/home/projects/" + ScriptApp.getScriptId() + "'>Apps Script</a> could not access your data at Tesla.com. <br>"+
        "Please go to https://github.com/TorZidan/TeslaWatch/blob/main/TeslaSolarWatch/README.md#getting-a-new-tesla-refresh-token"+
        " and follow the instructions to get a new refresh token and store in your code.",
      });
    
    throw e;
  }
}

/**
 * The email contains a link to the spreadsheet, but its URL has been cooked (by calling this function)
 * to contain the spreadsheet tab and row. This is useful if the user has added more tabs to this spreasheet: 
 * clicking the link in the email will open exactly the tab with the data.
 */
function composeSpreadsheetTabUrl(spreadsheetUrl, tabId, rowNumber) {
  const indexOfGid = spreadsheetUrl.indexOf("#gid=");
  if(indexOfGid == -1) {
    return spreadsheetUrl + "#gid=" + tabId + "&range="+rowNumber+":"+rowNumber;
  } else {
    // Replace the current ...#gid=... in the spreadheet url with a new one that is a link to the tabId that we want:
    return spreadsheetUrl.substring(0, indexOfGid + 5) + "#gid=" + tabId + "&range="+rowNumber+":"+rowNumber;
  }
}

/**
 * For what period to request daily data from the Tesla API:
 
function summaryEmailTypeToTeslaApiPeriod(summaryEmailType) {
  switch (summaryEmailType.toLowerCase())  {
    case "daily":
      return "day";
    case "none":
    case "weekly":
      return "week";
    case "monthly":
      return "month";
    default:
      return "week";
  }
}
*/

/**
 * Composes and sends the alert email.
 * 
 * siteId: Most Tesla users have just one siteId and don't care to see it in the email. So:
 * If the Tesla user has >1 siteId-s (more than solar systems in his account),
 * it will be passed in here, and it will be included in the email subject.
 * Othrwise, empty string will be passed.
 */
function sendAlertEmail(siteId, numWatsGeneratedLastDay, alertThresholdWatts, emailRecipients, spreadsheetUrl) {
  Logger.log(MailApp.getRemainingDailyQuota() + " emails left in today's emails-to-send quota.");

  const emailBody = "See more details in the <a href='" + spreadsheetUrl + "'>spreadsheet</a>. <br>"+
    "This email was sent by the Tesla Solar Watch AppsScript project <a href='https://script.google.com/home/projects/" + ScriptApp.getScriptId() + "'>here</a>.<br>"+
    "This project is owned and managed by the email sender.";
  MailApp.sendEmail({
    to: emailRecipients,
    subject: "Alert: In the last day my Tesla solar system "+siteId+" generated "+numWatsGeneratedLastDay+" Watts, which is below my alert threshold of "+alertThresholdWatts+" Watts!",
    htmlBody: emailBody,
  });
  Logger.log("Sent alert email(s) to "+emailRecipients);
}


function sendSummaryEmailIfNeeded(energySiteId, energuSiteTimeZone, energySiteCountryCode, summaryEmailType, emailRecipients, spreadsheet) {
  switch (summaryEmailType.toLowerCase())  {
    case "none":
      Logger.log("SUMMARY_EMAIL_TYPE is set to '"+summaryEmailType+"'. Will not send a summary email.");
      return;
    case "daily":
      break;
    case "weekly":
      // Make sure it's Monday if we need to send a Weekly summary email
      if(Utilities.formatDate(new Date(), energuSiteTimeZone, 'u')!=="1") {
        Logger.log("It's not Monday, will not send "+summaryEmailType+" summary email.");
        return;
      }
      break;
    case "monthly":
      // Make sure it's the 1st of the month if we need to send Monthly summary emails:
      if(Utilities.formatDate(new Date(), energuSiteTimeZone, 'd')!=="1") {
        Logger.log("It's not the 1st of the month, will not send "+summaryEmailType+" summary email.");
        return;
      }
      break;
    default:
      Logger.log("The SUMMARY_EMAIL_TYPE variable is set to an unknown value: '"+summaryEmailType+"'. Please edit it in the Apps Script file Settings.gs and set it to one of : 'None', 'Daily', 'Weekly' or 'Monthly'.");
      return;
  }

  sendSummaryEmail(energySiteId, energuSiteTimeZone, energySiteCountryCode, summaryEmailType, emailRecipients, spreadsheet);
}


/**
 * Composes and sends the (daily or weekly or monthly) summary email.
 * 
 * energySiteId: Most Tesla users have just one energy siteId and don't care to see it in the email. So:
 * If the Tesla user has >1 energySiteId-s (more than solar systems in his account),
 * it will be passed in here, and it will be included in the email subject.
 * Othrwise, empty string will be passed.
 * 
 * Note: we collect the data for the email from the spreadsheet rows, NOT from a call to the Tesla API.
 */
function sendSummaryEmail(energySiteId, energySiteTimeZone, energySiteCountryCode, summaryEmailType, emailRecipients, spreadsheet) {
  // TODO: if there is just one energySiteId, then do not print it in the email, for simplicity. 
  //         (arrayOfEnergySiteIds.length>1)? energySiteId:"",
 
  Logger.log(MailApp.getRemainingDailyQuota() + " emails left in today's emails-to-send quota.");

  const emailSubject = summaryEmailType+" summary for my solar system "+energySiteId+" energy generation";

  var emailBody = "";

  // We will set these unix timestamps to the start and end timestamps of the days for which we want to collect data from the spreadsheet.
  var lowerTs;
  var upperTs;

  var today = new Date();
  today.setHours(0, 0, 0, 0); // truncate it to the start of today
  var yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate()-1);

  switch (summaryEmailType.toLowerCase())  {
    case "none":
      Logger.log("SUMMARY_EMAIL_TYPE is set to '"+summaryEmailType+"'. Will not send a summary email.");
      return;
    case "daily":
      Logger.log("Composing a daily summary email containing data from yesterday ...");
      lowerTs = yesterday.getTime();
      upperTs = yesterday.getTime();
      break;
    case "weekly":
      Logger.log("Composing a weekly summary email containing data from the previous 7 days ...");
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate()-7);
      lowerTs = sevenDaysAgo.getTime();
      upperTs = yesterday.getTime();
      break;
    case "monthly":
      Logger.log("Composing a monthly summary email containing data from the last one month, up to yesterday ...");
      const year = yesterday.getYear(); 
      const month = yesterday.getMonth(); 
      const numDaysInLastMonth = (new Date(year, month, 0)).getDate();
      Logger.log("Calculated days="+numDaysInLastMonth);
      const oneMonthAgo = new Date(today);
      oneMonthAgo.setDate(yesterday.getDate()-numDaysInLastMonth);
      lowerTs = oneMonthAgo.getTime();
      upperTs = yesterday.getTime();
      break;
    default:
      emailBody = "The SUMMARY_EMAIL_TYPE variable is set to an unknown value: '"+summaryEmailType+"'. Please edit it in the Apps Script file Settings.gs and set it to one of : 'None', 'Daily', 'Weekly' or 'Monthly'.";
      break;
  }

  Logger.log("Will collect data from timestamp "+lowerTs+" to timestamp "+upperTs+" (inclusive)");

  const sheetTabForProductId = findOrCreateSheetTabWithNameLike(spreadsheet, energySiteId+" - Daily Script Run");

  const values = sheetTabForProductId.getDataRange().getValues();
  if(values.length==0) {
    Logger.log("Spreadsheet tab '"+energySiteId+" - Daily Script Run' has zero rows! Will not send summary email!");
    return;
  }
  if(values[0][1]!="timestamp") {
    Logger.log("Spreadsheet tab '"+energySiteId+" - Daily Script Run' does not contain the value 'timestamp' in cell B1! Something is wrong. Will not send summary email!");
    return;
  }

  emailBody += "<html><head>"+EMAIL_CSS_STYLES+"</head><body>"+
        summaryEmailType+" summary for my Tesla solar system energy generation:<br><br>"+
        "<table"+TABLE_STYLE+"><tr"+TR_STYLE+"><th>Date</th><th>Energy Generated, kW</th></tr>";

  var totalEnergyInWatts = 0;
  // Iterate over all rows in the spreadsheet tab for this energySiteId; 
  // If the "timestamp" at the current row (in column "B") is between the lowerTs and upperTs (inclusive), then include this row in the email.
  // This could be optimizedby iterating backwards (because the needed rows are at the end), and exiting as soon as we collected the data.
  for(i=1; i<values.length; i++) {
    const timestampAtRowAsString = values[i][1];
    // Logger.log("At timestamp "+timestampAtRowAsString);
    var dateAtRow;
    var previouslySeenDateAtRow;

    try {
      // Parse the timestamp value in column B, e.g. "2024-08-16T00:00:00-07:00" into a Date:
      dateAtRow = Utilities.parseDate(timestampAtRowAsString.substring(0,10), energySiteTimeZone, "yyyy-MM-dd");
    } catch (e) {
      Logger.log("Warning: could not parse spreadsheet cell '"+timestampAtRowAsString+"' into a Date! Skipping this row. The error is: " +e);
      dateAtRow = new Date();
    }

    // Ignore all adjacent rows that have the same truncated date and thake just the 1st such row. 
    // Why? likely they contain the same data, and then the total sum of energy generated for the given period will be wrong.
    // We may end up with such "duplicate" rows if we run the script >1 times in a given day.
    if(previouslySeenDateAtRow && truncateDate(dateAtRow) == truncateDate(previouslySeenDateAtRow)) {
      continue;
    }

    // Logger.log("#### At row with timestamp: "+timestampAtRowAsString+ " : "+dateAtRow.getTime());
    if(dateAtRow.getTime()>=lowerTs && dateAtRow.getTime()<=upperTs) {
      Logger.log("#### Collecting the row with timestamp "+timestampAtRowAsString);
      const dateAsStrInMyLocale = dateAtRow.toLocaleDateString(getLocale(energySiteCountryCode)); 
      const solarGenForDayInWatts = values[i][2];
      totalEnergyInWatts += solarGenForDayInWatts;
      const solarGenForDayInKw = (solarGenForDayInWatts/1000).toFixed(1);
      emailBody += ("<tr"+TR_STYLE+"><td>"+dateAsStrInMyLocale+"&nbsp;&nbsp;&nbsp;</td><td>"+solarGenForDayInKw.toLocaleString()+"</td></tr>");
    }

    previouslySeenDateAtRow = dateAtRow;
  }

  const totalEnergyInKw = (totalEnergyInWatts/1000).toFixed(1);
  emailBody += ("<tr"+TR_STYLE+"><td>---------------</td><td>-------</td></tr><tr"+TR_STYLE+"><td><b>Total:</b></td><td><b>"+totalEnergyInKw.toLocaleString()+"</b></td></tr></table>");

  const spreadsheetUrlForEmail = composeSpreadsheetTabUrl(TESLA_SOLAR_WATCH_SPREADSHEET_URL, sheetTabForProductId.getSheetId(), sheetTabForProductId.getLastRow());
  emailBody += ("<br>See more details in the <a href='" + spreadsheetUrlForEmail + "'>spreadsheet</a>. <br>"+
  "This email was sent by the Tesla Solar Watch Apps Script project <a href='https://script.google.com/home/projects/" + ScriptApp.getScriptId() + "'>here</a>.<br>"+
  "This project is owned and managed by the email sender.</body></html>");
  MailApp.sendEmail({
    to: emailRecipients,
    subject: emailSubject,
    htmlBody: emailBody,
  });
  Logger.log("Sent "+summaryEmailType+" summary email(s) to "+emailRecipients+": \n"+emailBody);
}

/* Remove the time component from the date, return a new date obj */
function truncateDate(d) {
  return new Date(d).setHours(0,0,0,0);
}

// For some reason gmail does not honor my styles below, and the weekly/monthly emails
// (which do contain an html table) appear dull, unstyled.
const EMAIL_CSS_STYLES = "<style>\n"+
  "  .gmail-table {\n"+
  "    border: solid 2px #DDEEEE;\n"+
  "    border-collapse: collapse;\n"+
  "    border-spacing: 0;\n"+
  "    font: normal 14px Roboto, sans-serif;\n"+
  "  }\n"+
  "  .gmail-table thead th {\n"+
  "    background-color: #DDEFEF;\n"+
  "    border: solid 1px #DDEEEE;\n"+
  "    color: #336B6B;\n"+
  "    padding: 10px;\n"+
  "    text-align: left;\n"+
  "    text-shadow: 1px 1px 1px #fff;\n"+
  "  }\n"+
  " .gmail-table tbody td {\n"+
  "    border: solid 1px #DDEEEE;\n"+
  "    color: #333;\n"+
  "    padding: 10px;\n"+
  "    text-shadow: 1px 1px 1px #fff;\n"+
  "  }\n"+
  "</style>";
  const TABLE_STYLE="";
  const TR_STYLE="";

/**
 * Example: for input "2023-12-23T01:00:00-08:00", "US"
 * it returns "12/22/2023".
 * 
 * Note that we convert the date "23" to "22", because
 * for some silly reason the Tesla API results always have 
 * the wrong date (always are 1-day ahead).
 */
function teslaTimestampToDateStringInMyLocale(teslaTimestampStr, countryCode) {
  const year = parseInt(teslaTimestampStr.substring(0, 4));
  const month = parseInt(teslaTimestampStr.substring(5, 7));
  const day = parseInt(teslaTimestampStr.substring(8, 10));
  // Logger.log(year+" "+month+" "+day);
  const theDate = new Date(year-1, month-1, day-1, 0, 0, 0, 0);
  // Logger.log(theDate);
  return theDate.toLocaleDateString(getLocale(countryCode));
  //Logger.log(result);
  //return result;
}

// We jump thorugh a lot of hurdles just to format a date in the user's locale (which we don't know, but we may know his country code :)
function getLocale(countryCode) {
  if(countryCode==null || countryCode==="") {
    return "en-US";
  }
  const countryCodeUppercase = countryCode.toUpperCase();
  for(localeId=0; localeId<arrayOfAllLocales.length; localeId++) {
    if(arrayOfAllLocales[localeId].endsWith(countryCodeUppercase)) {
      return arrayOfAllLocales[localeId];
    }
  }
  return "en-US";
}
const arrayOfAllLocales = ["af-ZA","am-ET","ar-AE","ar-BH","ar-DZ","ar-EG","ar-IQ","ar-JO","ar-KW","ar-LB","ar-LY","ar-MA","arn-CL","ar-OM","ar-QA","ar-SA","ar-SD","ar-SY","ar-TN","ar-YE","as-IN","az-az","az-Cyrl-AZ","az-Latn-AZ","ba-RU","be-BY","bg-BG","bn-BD","bn-IN","bo-CN","br-FR","bs-Cyrl-BA","bs-Latn-BA","ca-ES","co-FR","cs-CZ","cy-GB","da-DK","de-AT","de-CH","de-DE","de-LI","de-LU","dsb-DE","dv-MV","el-CY","el-GR","en-029","en-AU","en-BZ","en-CA","en-cb","en-GB","en-IE","en-IN","en-JM","en-MT","en-MY","en-NZ","en-PH","en-SG","en-TT","en-US","en-ZA","en-ZW","es-AR","es-BO","es-CL","es-CO","es-CR","es-DO","es-EC","es-ES","es-GT","es-HN","es-MX","es-NI","es-PA","es-PE","es-PR","es-PY","es-SV","es-US","es-UY","es-VE","et-EE","eu-ES","fa-IR","fi-FI","fil-PH","fo-FO","fr-BE","fr-CA","fr-CH","fr-FR","fr-LU","fr-MC","fy-NL","ga-IE","gd-GB","gd-ie","gl-ES","gsw-FR","gu-IN","ha-Latn-NG","he-IL","hi-IN","hr-BA","hr-HR","hsb-DE","hu-HU","hy-AM","id-ID","ig-NG","ii-CN","in-ID","is-IS","it-CH","it-IT","iu-Cans-CA","iu-Latn-CA","iw-IL","ja-JP","ka-GE","kk-KZ","kl-GL","km-KH","kn-IN","kok-IN","ko-KR","ky-KG","lb-LU","lo-LA","lt-LT","lv-LV","mi-NZ","mk-MK","ml-IN","mn-MN","mn-Mong-CN","moh-CA","mr-IN","ms-BN","ms-MY","mt-MT","nb-NO","ne-NP","nl-BE","nl-NL","nn-NO","no-no","nso-ZA","oc-FR","or-IN","pa-IN","pl-PL","prs-AF","ps-AF","pt-BR","pt-PT","qut-GT","quz-BO","quz-EC","quz-PE","rm-CH","ro-mo","ro-RO","ru-mo","ru-RU","rw-RW","sah-RU","sa-IN","se-FI","se-NO","se-SE","si-LK","sk-SK","sl-SI","sma-NO","sma-SE","smj-NO","smj-SE","smn-FI","sms-FI","sq-AL","sr-BA","sr-CS","sr-Cyrl-BA","sr-Cyrl-CS","sr-Cyrl-ME","sr-Cyrl-RS","sr-Latn-BA","sr-Latn-CS","sr-Latn-ME","sr-Latn-RS","sr-ME","sr-RS","sr-sp","sv-FI","sv-SE","sw-KE","syr-SY","ta-IN","te-IN","tg-Cyrl-TJ","th-TH","tk-TM","tlh-QS","tn-ZA","tr-TR","tt-RU","tzm-Latn-DZ","ug-CN","uk-UA","ur-PK","uz-Cyrl-UZ","uz-Latn-UZ","uz-uz","vi-VN","wo-SN","xh-ZA","yo-NG","zh-CN","zh-HK","zh-MO","zh-SG","zh-TW","zu-ZA"];
